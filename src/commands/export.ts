import { Notice, TFile } from 'obsidian';
import { shell } from 'electron';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type ObsiPrintPlugin from '../main';
import { buildImage, imageExists, runPipeline } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath, resolveOutputPath } from '../utils/paths';

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
		try {
			await buildImage(pluginDir);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Failed to build Docker image. Try to build in the plugin settings. ${msg}`, 10000);
			return;
		}
		new Notice(
			'Image not built yet — build it in the plugin settings.',
			8000,
		);
		return;
	}

	// Resolve paths.
	const vaultPath = getVaultAbsolutePath(plugin.app);
	const sourceAbs = join(vaultPath, file.path);
	const destPath = resolveOutputPath(plugin.settings.outputPath, sourceAbs, vaultPath);

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

	new Notice(`Exported to ${destPath}`);

	// Optional auto-open.
	if (plugin.settings.autoOpenPdf) {
		void shell.openPath(destPath);
	}
}
