import { Notice, TFile, normalizePath } from 'obsidian';
import { shell } from 'electron';
import { copyFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, relative, sep } from 'path';
import type NopePlugin from '../main';
import { buildImage, checkDockerReady, cleanupIntermediates, imageExists, runPipeline } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath, resolveOutputPath } from '../utils/paths';
import { ProgressNotice, parseBuildStep, parsePipelinePhase } from '../utils/progress';
import { prepareBrandingOverride } from '../utils/branding';
import { prepareBibliography } from '../utils/bibliography';
import { ensureBundledAssets } from '../utils/assets';

export function registerExportCommand(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'export-active-note',
		name: 'Export active note to PDF',
		callback: async () => {
			await exportActiveNote(plugin);
		},
	});
}

async function exportActiveNote(plugin: NopePlugin): Promise<void> {
	// Get the active markdown file.
	const file = plugin.app.workspace.getActiveFile();
	if (!file || !(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
		new Notice('No active note to export.');
		return;
	}

	const pluginDir = getPluginAbsoluteDir(plugin);
	const vaultPath = getVaultAbsolutePath(plugin.app);

	const progress = new ProgressNotice(`Exporting "${file.basename}"…`);

	// Ensure the bundled pipeline/ + skill/ are present
	try {
		ensureBundledAssets(pluginDir, plugin.manifest.version);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		progress.fail(`Pipeline files missing and could not be created. ${msg}`);
		return;
	}

	// Verify Docker is ready
	const dockerReady = await checkDockerReady();
	if (!dockerReady.ok) {
		progress.fail(dockerReady.message);
		return;
	}


	// Image must be built
	if (!(await imageExists())) {
		progress.update('Docker image not found — building it now (first run, 5–15 min)…');
		try {
			await buildImage(pluginDir, false, (chunk) => {
				const step = parseBuildStep(chunk);
				if (step) progress.update(`Building Docker image (first run, 5–15 min) — ${step}`);
			});
			progress.update(`Docker image built — exporting "${file.basename}"…`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			progress.fail(`Failed to build Docker image. Try to build in the plugin settings. ${msg}`);
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
		prepareBrandingOverride(
			plugin.app,
			file,
			workDir,
			vaultPath,
			baseName,
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		progress.fail(`Branding override failed. ${msg}`);
		return;
	}

	// Materialize bibliography; copy to work directory with fixed filenames for build.sh.
	try {
		prepareBibliography(
			plugin.app,
			file,
			workDir,
			vaultPath,
			pluginDir,
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		progress.fail(`Bibliography prep failed. ${msg}`);
		return;
	}

	// Run export pipeline
	let producedPdf: string;
	try {
		producedPdf = await runPipeline(pluginDir, vaultPath, file.path, (chunk) => {
			const phase = parsePipelinePhase(chunk);
			if (phase) progress.update(`Exporting "${file.basename}" — ${phase}`);
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		progress.fail(`Export failed. ${msg}`);
		return;
	}

	// Copy PDF to destination.
	try {
		const vaultRelPath = relative(vaultPath, destPath);
		if (vaultRelPath.startsWith('..') || isAbsolute(vaultRelPath)) {
			// Destination outside the vault: plain filesystem copy.
			mkdirSync(dirname(destPath), { recursive: true });
			copyFileSync(producedPdf, destPath);
		} else {
			const data = readFileSync(producedPdf);
			const adapterPath = normalizePath(vaultRelPath.split(sep).join('/'));
			const parentDir = adapterPath.includes('/')
				? adapterPath.slice(0, adapterPath.lastIndexOf('/'))
				: '';
			if (parentDir) {
				await plugin.app.vault.adapter.mkdir(parentDir);
			}
			const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
			await plugin.app.vault.adapter.writeBinary(adapterPath, buf);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		progress.fail(`Export failed while copying the PDF. Build folder kept for inspection. ${msg}`);
		return;
	}

	// Cleanup build artifacts unless keepLatexIntermediates is enabled.
	if (!plugin.settings.keepLatexIntermediates) {
		cleanupIntermediates(workDir);
	}

	progress.succeed(`Exported to ${destPath}`);

	// Auto-open PDF if enabled.
	if (plugin.settings.autoOpenPdf) {
		void shell.openPath(destPath);
	}
}
