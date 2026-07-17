/** Filesystem path helpers: plugin dir, vault root and the resolved PDF output path. */
import { App, FileSystemAdapter, Plugin } from 'obsidian';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';

// Augment PluginManifest with undocumented stable `dir` property.
declare module 'obsidian' {
	interface PluginManifest {
		dir?: string;
	}
}

/** Absolute path to the plugin directory. Throws if the adapter is not a FileSystemAdapter. */
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

/** Absolute path to the vault root. Throws if the adapter is not a FileSystemAdapter. */
export function getVaultAbsolutePath(app: App): string {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error('Vault adapter is not a FileSystemAdapter');
	}
	return adapter.getBasePath();
}

/**
 * Resolve the final PDF output path from the configured outputPath.
 * Supports ~, absolute and vault-relative forms. Appends the filename when the
 * path is a directory, saves next to the source note when the path is empty.
 */
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
