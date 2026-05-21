// Maintenance commands: remove the docker image and wipe pipeline/build/*.
// Both actions are also exposed as buttons in the settings tab.

import { Notice } from 'obsidian';
import type ObsiPrintPlugin from '../main';
import { cleanupBuildFolder, removeImage } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath } from '../utils/paths';
import { installSkill } from '../utils/skill';

export function registerMaintenanceCommands(plugin: ObsiPrintPlugin): void {
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

export function cleanupBuild(plugin: ObsiPrintPlugin): void {
	try {
		const removed = cleanupBuildFolder(getPluginAbsoluteDir(plugin));
		new Notice(`Build folder cleaned (${removed} entr${removed === 1 ? 'y' : 'ies'} removed).`);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Cleanup failed: ${msg}`, 10000);
	}
}

export function installAiSkill(plugin: ObsiPrintPlugin): void {
	try {
		installSkill(getPluginAbsoluteDir(plugin), getVaultAbsolutePath(plugin.app));
		new Notice('AI conventions skill installed.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Skill install failed: ${msg}`, 10000);
	}
}
