import { Plugin } from 'obsidian';
import { join } from 'path';

/**
 * Returns the absolute filesystem path to this plugin's folder
 * (e.g. /Users/.../Vault/.obsidian/plugins/obsi-print).
 *
 * Combines the vault base path with manifest.dir when available, falls back
 * to constructing the standard .obsidian/plugins/<id> path.
 */
export function getPluginAbsoluteDir(plugin: Plugin): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const adapter = plugin.app.vault.adapter as any;
	const basePath: string | undefined = adapter.basePath ?? adapter.getBasePath?.();
	if (!basePath) {
		throw new Error('Cannot resolve vault base path from adapter');
	}

	// manifest.dir is provided by Obsidian at runtime but not in the public
	// type definitions. It is vault-relative (e.g. ".obsidian/plugins/obsi-print").
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const relDir: string | undefined = (plugin.manifest as any).dir;
	if (relDir) {
		return join(basePath, relDir);
	}

	return join(basePath, '.obsidian', 'plugins', plugin.manifest.id);
}
