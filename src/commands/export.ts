import { Notice, TFile } from 'obsidian';
import { shell } from 'electron';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type ObsiPrintPlugin from '../main';
import { buildImage, checkDockerReady, cleanupIntermediates, imageExists, runPipeline } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath, resolveOutputPath } from '../utils/paths';
import { prepareBrandingOverride } from '../utils/branding';
import { prepareBibliography } from '../utils/bibliography';
import { getSkillStatus } from '../utils/skill';
import { ensureBundledAssets } from '../utils/assets';

export function registerExportCommand(plugin: ObsiPrintPlugin): void {
	plugin.addCommand({
		id: 'export-active-note',
		name: 'Export active note to PDF',
		callback: async () => {
			await exportActiveNote(plugin);
		},
	});
}

async function exportActiveNote(plugin: ObsiPrintPlugin): Promise<void> {
	// Get the active markdown file.
	const file = plugin.app.workspace.getActiveFile();
	if (!file || !(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
		new Notice('No active note to export.');
		return;
	}

	const pluginDir = getPluginAbsoluteDir(plugin);
	const vaultPath = getVaultAbsolutePath(plugin.app);

	// Ensure the bundled pipeline/ + skill/ are present (idempotent; no-op once
	// extracted for this version). Guards against installs without onload setup.
	try {
		ensureBundledAssets(pluginDir, plugin.manifest.version);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Pipeline files missing and could not be created. ${msg}`, 10000);
		return;
	}

	// Verify Docker is ready before doing anything else, so a stopped daemon
	// yields a clear message instead of a cryptic compose failure.
	const dockerReady = await checkDockerReady();
	if (!dockerReady.ok) {
		new Notice(dockerReady.message, 10000);
		return;
	}

	// Warn if AI skill is missing; does not block export since pipeline is independent.
	if (getSkillStatus(pluginDir, vaultPath) === 'missing') {
		new Notice(
			'AI conventions skill not installed. Install via plugin settings → AI conventions skill.',
			10000,
		);
	}

	// Image must be built.
	if (!(await imageExists())) {
		new Notice('Docker image not found. Building it now. This may take a while…');
		try {
			await buildImage(pluginDir);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Failed to build Docker image. Try to build in the plugin settings. ${msg}`, 10000);
			return;
		}
	}

	// Resolve source and destination paths.
	const sourceAbs = join(vaultPath, file.path);
	const destPath = resolveOutputPath(plugin.settings.outputPath, sourceAbs, vaultPath);

	// Create per-document build directory.
	const baseName = file.basename;
	const workDir = join(pluginDir, 'pipeline', 'build', baseName);
	mkdirSync(workDir, { recursive: true });

	// Materialize branding overrides; fail loudly if branding file cannot be resolved.
	try {
		const prepared = prepareBrandingOverride(
			plugin.app,
			file,
			workDir,
			vaultPath,
			baseName,
		);
		if (prepared) {
			new Notice(
				`Branding override applied (${prepared.copiedAssets.length} asset(s)).`,
			);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Branding override failed. ${msg}`, 10000);
		return;
	}

	// Materialize bibliography; copy to work directory with fixed filenames for build.sh.
	try {
		const preparedBib = prepareBibliography(
			plugin.app,
			file,
			workDir,
			vaultPath,
			pluginDir,
		);
		if (preparedBib) {
			const cslPart = preparedBib.cslHostPath
				? preparedBib.cslPreinstalled
					? ' + preinstalled CSL'
					: ' + custom CSL'
				: '';
			new Notice(`Bibliography prepared${cslPart}.`);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Bibliography prep failed. ${msg}`, 10000);
		return;
	}

	// Run export pipeline.
	new Notice(`Exporting "${file.basename}"…`);
	let producedPdf: string;
	try {
		producedPdf = await runPipeline(pluginDir, vaultPath, file.path);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Export failed. ${msg}`, 10000);
		return;
	}

	// Copy PDF to destination.
	mkdirSync(dirname(destPath), { recursive: true });
	copyFileSync(producedPdf, destPath);

	// Cleanup build artifacts unless keepLatexIntermediates is enabled.
	if (!plugin.settings.keepLatexIntermediates) {
		cleanupIntermediates(workDir);
	}

	new Notice(`Exported to ${destPath}`);

	// Auto-open PDF if enabled.
	if (plugin.settings.autoOpenPdf) {
		void shell.openPath(destPath);
	}
}
