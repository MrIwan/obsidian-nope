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

async function buildDockerImage(plugin: ObsiPrintPlugin): Promise<void> {
	new Notice('Building docker image — this may take several minutes…');
	try {
		const pluginDir = getPluginAbsoluteDir(plugin);
		await buildImage(pluginDir); // noCache defaults to false → uses cache
		new Notice('Docker image build complete.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Build failed, try building in the plugin settings: ${msg}`, 10000);
	}
}
