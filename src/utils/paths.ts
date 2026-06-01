import { App, FileSystemAdapter, Plugin } from 'obsidian';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';

// Augment PluginManifest with undocumented stable `dir` property.
declare module 'obsidian' {
	interface PluginManifest {
		dir?: string;
	}
}

// Resolve plugin directory absolute path.
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

// Resolve vault root directory absolute path.
export function getVaultAbsolutePath(app: App): string {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error('Vault adapter is not a FileSystemAdapter');
	}
	return adapter.getBasePath();
}

// Resolve final PDF output path; supports ~, absolute, and vault-relative paths.
export function resolveOutputPath(
	outputPath: string,
	sourceNoteAbsPath: string,
	vaultBasePath: string,
): string {
	const sourceBase = basename(sourceNoteAbsPath).replace(/\.md$/i, '');
	const pdfFilename = `${sourceBase}.pdf`;

	const trimmed = outputPath.trim();

	// Empty path: save next to source note.
	if (!trimmed) {
		return join(dirname(sourceNoteAbsPath), pdfFilename);
	}

	// Resolve base path from ~, /, or vault-relative syntax.
	let resolved: string;
	if (trimmed.startsWith('~/') || trimmed === '~') {
		resolved = join(homedir(), trimmed.slice(1).replace(/^\//, ''));
	} else if (trimmed.startsWith('/')) {
		resolved = trimmed;
	} else {
		resolved = join(vaultBasePath, trimmed);
	}

	// Append filename if path is a directory.
	if (/\.pdf$/i.test(resolved)) {
		return resolved;
	}
	return join(resolved, pdfFilename);
}
