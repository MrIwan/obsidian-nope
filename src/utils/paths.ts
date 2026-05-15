import { App, FileSystemAdapter, Plugin } from 'obsidian';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';

// Augment Obsidian's PluginManifest with the (undocumented but stable) runtime
// `dir` property — vault-relative path to the plugin folder.
declare module 'obsidian' {
	interface PluginManifest {
		dir?: string;
	}
}

// Plugin Directory Resolution
export function getPluginAbsoluteDir(plugin: Plugin): string {
	const adapter = plugin.app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error('Vault adapter is not a FileSystemAdapter');
	}
	const basePath = adapter.getBasePath();

	const relDir = plugin.manifest.dir;
	if (relDir) {
		return join(basePath, relDir);
	}

	return join(basePath, plugin.app.vault.configDir, 'plugins', plugin.manifest.id);
}

// Vault Path Resolution
export function getVaultAbsolutePath(app: App): string {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error('Vault adapter is not a FileSystemAdapter');
	}
	return adapter.getBasePath();
}

// Output Path Resolution
export function resolveOutputPath(
	outputPath: string,
	sourceNoteAbsPath: string,
	vaultBasePath: string,
): string {
	const sourceBase = basename(sourceNoteAbsPath).replace(/\.md$/i, '');
	const pdfFilename = `${sourceBase}.pdf`;

	const trimmed = outputPath.trim();

	// Empty → place next to source note.
	if (!trimmed) {
		return join(dirname(sourceNoteAbsPath), pdfFilename);
	}

	// Resolve the "base" path (folder OR explicit file).
	let resolved: string;
	if (trimmed.startsWith('~/') || trimmed === '~') {
		resolved = join(homedir(), trimmed.slice(1).replace(/^\//, ''));
	} else if (trimmed.startsWith('/')) {
		resolved = trimmed;
	} else {
		resolved = join(vaultBasePath, trimmed);
	}

	// File-vs-folder heuristic.
	if (/\.pdf$/i.test(resolved)) {
		return resolved;
	}
	return join(resolved, pdfFilename);
}
