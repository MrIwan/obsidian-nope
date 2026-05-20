import { Notice, TFile } from 'obsidian';
import { shell } from 'electron';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type ObsiPrintPlugin from '../main';
import { buildImage, cleanupIntermediates, imageExists, runPipeline } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath, resolveOutputPath } from '../utils/paths';
import { prepareBrandingOverride } from '../utils/branding';

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

	// Image must be built.
	const pluginDir = getPluginAbsoluteDir(plugin);
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

	// Resolve paths.
	const vaultPath = getVaultAbsolutePath(plugin.app);
	const sourceAbs = join(vaultPath, file.path);
	const destPath = resolveOutputPath(plugin.settings.outputPath, sourceAbs, vaultPath);

	// Compute the per-doc build dir (host path that maps to /build/<base>/ in container).
	const baseName = file.basename;
	const workDir = join(pluginDir, 'pipeline', 'build', baseName);
	mkdirSync(workDir, { recursive: true });

	// Branding-Override (Feature 4): materialize per-export YAML + assets.
	// Aborts the export with a Notice if the doc references a branding file
	// that can't be resolved — better fail-loud than ship a PDF that silently
	// fell back to the base defaults.
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

	// Run the pipeline.
	new Notice(`Exporting "${file.basename}"…`);
	let producedPdf: string;
	try {
		producedPdf = await runPipeline(pluginDir, vaultPath, file.path);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Export failed. ${msg}`, 10000);
		return;
	}

	// Copy the produced PDF to the user's destination.
	mkdirSync(dirname(destPath), { recursive: true });
	copyFileSync(producedPdf, destPath);

	// Drop the whole build/<doc>/ folder unless the user wants intermediates for debugging.
	if (!plugin.settings.keepLatexIntermediates) {
		cleanupIntermediates(workDir);
	}

	new Notice(`Exported to ${destPath}`);

	// Optional auto-open.
	if (plugin.settings.autoOpenPdf) {
		void shell.openPath(destPath);
	}
}
