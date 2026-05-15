import { Notice, TFile } from 'obsidian';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type ObsiPrintPlugin from '../main';
import { imageExists, runPipeline } from '../utils/docker';
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
		new Notice('Obsi Print: no active markdown note to export.');
		return;
	}

	//  image must be built
	if (!(await imageExists())) {
		new Notice(
			'Obsi Print: Docker image not built yet. Open Settings → Obsi Print → Build image.',
			8000,
		);
		return;
	}

	// resolve paths.
	const pluginDir = getPluginAbsoluteDir(plugin);
	const vaultPath = getVaultAbsolutePath(plugin.app);
	const sourceAbs = join(vaultPath, file.path);
	const destPath = resolveOutputPath(plugin.settings.outputPath, sourceAbs, vaultPath);

	// run the pipeline.
	new Notice(`Obsi Print: exporting "${file.basename}"…`);
	let producedPdf: string;
	try {
		producedPdf = await runPipeline(pluginDir, vaultPath, file.path);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Obsi Print: export failed. ${msg}`, 10000);
		return;
	}

	// copy the produced PDF to the user's destination.
	mkdirSync(dirname(destPath), { recursive: true });
	copyFileSync(producedPdf, destPath);

	new Notice(`Obsi Print: exported to ${destPath}`);

	// optional auto-open.
	if (plugin.settings.autoOpenPdf) {
		const electron = require('electron');
		electron.shell.openPath(destPath);
	}
}
