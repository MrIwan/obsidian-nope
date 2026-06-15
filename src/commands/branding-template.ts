// Generate branding template file with documented frontmatter keys.

import { readFileSync } from 'fs';
import { join } from 'path';
import { Notice, normalizePath, TFile } from 'obsidian';
import type NopePlugin from '../main';
import { getPluginAbsoluteDir } from '../utils/paths';

const TEMPLATE_FILENAME = 'Branding-Template.md';
// Source of truth lives on disk (bundled + materialized by ensureBundledAssets).
const TEMPLATE_SOURCE = join('resources', 'branding-template.md');

export function registerBrandingTemplateCommand(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'create-branding-template',
		name: 'Create branding template',
		callback: async () => {
			await createBrandingTemplate(plugin);
		},
	});
}

// Return next available numbered path if filename already exists.
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

async function createBrandingTemplate(plugin: NopePlugin): Promise<void> {
	// Use numbered suffix to avoid overwriting existing branding templates.
	const path = pickAvailablePath(plugin, TEMPLATE_FILENAME);

	let content: string;
	try {
		content = readFileSync(join(getPluginAbsoluteDir(plugin), TEMPLATE_SOURCE), 'utf8');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Branding template source missing: ${msg}`, 10000);
		return;
	}

	try {
		const file = await plugin.app.vault.create(path, content);
		new Notice(`Branding template created: ${path}`);
		if (file instanceof TFile) {
			await plugin.app.workspace.openLinkText(file.path, '', false);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Could not create branding template: ${msg}`, 10000);
	}
}
