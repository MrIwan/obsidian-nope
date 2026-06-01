import { Notice } from 'obsidian';
import type ObsiPrintPlugin from '../main';
import { buildImage } from '../utils/docker';
import { getPluginAbsoluteDir } from '../utils/paths';

export function registerBuildCommand(plugin: ObsiPrintPlugin): void {
	plugin.addCommand({
		id: 'build-docker-image',
		name: 'Build docker image (with cache)',
		callback: async () => {
			await buildDockerImage(plugin);
		},
	});
}

export function registerBuildCommandnoCache(plugin: ObsiPrintPlugin): void {
	plugin.addCommand({
		id: 'build-docker-image-no-cache',
		name: 'Build docker image (no cache)',
		callback: async () => {
			await buildDockerImage(plugin, true);
		},
	});
}

async function buildDockerImage(plugin: ObsiPrintPlugin, noCache: boolean = false): Promise<void> {
	new Notice('Building docker image (may take several minutes)…');
	try {
		const pluginDir = getPluginAbsoluteDir(plugin);
		await buildImage(pluginDir, noCache);
		new Notice('Docker image build complete.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Build failed: ${msg}`, 10000);
	}
}
