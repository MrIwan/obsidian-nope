// System maintenance commands: image removal and build cleanup.

import { Notice } from 'obsidian';
import type AtomicPressPlugin from '../main';
import { cleanupBuildFolder, removeImage } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath } from '../utils/paths';
import { installSkill } from '../utils/skill';

export function registerMaintenanceCommands(plugin: AtomicPressPlugin): void {
	plugin.addCommand({
		id: 'toggle open pdf after export',
		name: `Toggle open PDF after export`,
		callback: async () => {
			plugin.settings.autoOpenPdf = !plugin.settings.autoOpenPdf;
			await plugin.saveSettings();
			new Notice(`Open PDF after export ${plugin.settings.autoOpenPdf ? 'enabled' : 'disabled'}.`);
		},
	});

	plugin.addCommand({
		id: 'remove-docker-image',
		name: 'Remove docker image',
		callback: () => removeDockerImage(),
	});

	plugin.addCommand({
		id: 'cleanup-build-folder',
		name: 'Cleanup build folder',
		callback: () => cleanupBuild(plugin),
	});

	plugin.addCommand({
		id: 'install-ai-conventions-skill',
		name: 'Install AI conventions skill',
		callback: () => installAiSkill(plugin),
	});
}

export async function removeDockerImage(): Promise<void> {
	try {
		await removeImage();
		new Notice('Docker image removed.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Could not remove image: ${msg}`, 10000);
	}
}

export function cleanupBuild(plugin: AtomicPressPlugin): void {
	try {
		const removed = cleanupBuildFolder(getPluginAbsoluteDir(plugin));
		new Notice(`Build folder cleaned (${removed} entr${removed === 1 ? 'y' : 'ies'} removed).`);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Cleanup failed: ${msg}`, 10000);
	}
}

export function installAiSkill(plugin: AtomicPressPlugin): void {
	try {
		installSkill(getPluginAbsoluteDir(plugin), getVaultAbsolutePath(plugin.app));
		new Notice('AI conventions skill installed.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Skill install failed: ${msg}`, 10000);
	}
}
