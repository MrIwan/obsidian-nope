/** Commands to build the Docker pipeline image, with and without cache. */
import type NopePlugin from '../main';
import { buildImage } from '../utils/docker';
import { getPluginAbsoluteDir } from '../utils/paths';
import { ProgressNotice, parseBuildStep } from '../utils/progress';

/** Register the "Build docker image (with cache)" command. */
export function registerBuildCommand(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'build-docker-image',
		name: 'Build docker image (with cache)',
		callback: async () => {
			await buildDockerImage(plugin);
		},
	});
}

/** Register the "Build docker image (no cache)" command. */
export function registerBuildCommandnoCache(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'build-docker-image-no-cache',
		name: 'Build docker image (no cache)',
		callback: async () => {
			await buildDockerImage(plugin, true);
		},
	});
}

async function buildDockerImage(plugin: NopePlugin, noCache: boolean = false): Promise<void> {
	// Persistent notice with live BuildKit steps
	const progress = new ProgressNotice('Building docker image (first run, 5–15 min)…');
	try {
		const pluginDir = getPluginAbsoluteDir(plugin);
		await buildImage(pluginDir, noCache, (chunk) => {
			const step = parseBuildStep(chunk);
			if (step) progress.update(`Building docker image — ${step}`);
		});
		progress.succeed('Docker image build complete.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		progress.fail(`Build failed: ${msg}`);
	}
}
