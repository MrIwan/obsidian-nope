/** Command: copy the nope_minimal.tex starter into the vault as a custom-template base. */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Notice, normalizePath, TFile } from 'obsidian';
import type NopePlugin from '../main';
import { getPluginAbsoluteDir } from '../utils/paths';

const TEMPLATE_FILENAME = 'nope_minimal.tex';
const TEMPLATE_SOURCE = join('pipeline', 'app', 'template', 'nope_minimal.tex');

/** Register the "Create custom LaTeX template" command. */
export function registerCustomTemplateCommand(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'create-custom-latex-template',
		name: 'Create custom LaTeX template',
		callback: async () => {
			await createCustomTemplate(plugin);
		},
	});
}

// Return next available numbered path if the filename already exists.
function pickAvailablePath(plugin: NopePlugin, filename: string): string {
	const dotIdx = filename.lastIndexOf('.');
	const stem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
	const ext = dotIdx >= 0 ? filename.slice(dotIdx) : '';
	let candidate = normalizePath(filename);
	let n = 2;
	while (plugin.app.vault.getAbstractFileByPath(candidate) !== null) {
		candidate = normalizePath(`${stem}-${n}${ext}`);
		n += 1;
	}
	return candidate;
}

async function createCustomTemplate(plugin: NopePlugin): Promise<void> {
	const path = pickAvailablePath(plugin, TEMPLATE_FILENAME);

	let content: string;
	try {
		content = readFileSync(join(getPluginAbsoluteDir(plugin), TEMPLATE_SOURCE), 'utf8');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Custom LaTeX template source missing: ${msg}`, 10000);
		return;
	}

	let file: TFile | null = null;
	try {
		const created = await plugin.app.vault.create(path, content);
		file = created instanceof TFile ? created : null;
		new Notice(`Custom LaTeX template created: ${path}. Point a note at it via nope-template.`);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Could not create custom LaTeX template: ${msg}`, 10000);
		return;
	}

	// Best-effort open; .tex may not have a registered editor view.
	if (file) {
		try {
			await plugin.app.workspace.openLinkText(file.path, '', false);
		} catch {
			// Non-fatal: the file exists in the vault regardless.
		}
	}
}
