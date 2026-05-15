import { App, Plugin } from 'obsidian';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';

// Plugin Directory Resolution
export function getPluginAbsoluteDir(plugin: Plugin): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const adapter = plugin.app.vault.adapter as any;
	const basePath: string | undefined = adapter.basePath ?? adapter.getBasePath?.();
	if (!basePath) {
		throw new Error('Cannot resolve vault base path from adapter');
	}

	const relDir: string | undefined = (plugin.manifest as any).dir;
	if (relDir) {
		return join(basePath, relDir);
	}

	return join(basePath, '.obsidian', 'plugins', plugin.manifest.id);
}

// Vault Path Resolution
export function getVaultAbsolutePath(app: App): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const adapter = app.vault.adapter as any;
	const basePath: string | undefined = adapter.basePath ?? adapter.getBasePath?.();
	if (!basePath) {
		throw new Error('Cannot resolve vault base path from adapter');
	}
	return basePath;
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
