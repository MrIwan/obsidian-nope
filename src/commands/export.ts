/** Command: export the active note to PDF. */
import { Notice, TFile } from 'obsidian';
import type NopePlugin from '../main';
import { ProgressNotice } from '../utils/progress';
import { runExport } from '../utils/export';

/** Register the "Export active note to PDF" command. */
export function registerExportCommand(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'export-active-note',
		name: 'Export active note to PDF',
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
				new Notice('No active note to export.');
				return;
			}
			const progress = new ProgressNotice(`Exporting "${file.basename}"…`);
			await runExport(plugin, file, { reporter: progress });
		},
	});
}
