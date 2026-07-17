/** Maintenance commands: toggle auto-open, remove the image, clean the build folder, install the skill. */

import { Notice } from 'obsidian';
import type NopePlugin from '../main';
import { cleanupBuildFolder, removeImage } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath } from '../utils/paths';
import { installSkill } from '../utils/skill';

/** Register all maintenance commands on the plugin. */
export function registerMaintenanceCommands(plugin: NopePlugin): void {
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

/** Remove the pipeline Docker image, reporting the outcome as a notice. */
export async function removeDockerImage(): Promise<void> {
	try {
		await removeImage();
		new Notice('Docker image removed.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Could not remove image: ${msg}`, 10000);
	}
}

/** Delete the pipeline build folder contents, reporting how many entries were removed. */
export function cleanupBuild(plugin: NopePlugin): void {
	try {
		const removed = cleanupBuildFolder(getPluginAbsoluteDir(plugin));
		new Notice(`Build folder cleaned (${removed} entr${removed === 1 ? 'y' : 'ies'} removed).`);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Cleanup failed: ${msg}`, 10000);
	}
}

/** Copy the AI conventions skill into the vault, reporting the outcome as a notice. */
export function installAiSkill(plugin: NopePlugin): void {
	try {
		installSkill(getPluginAbsoluteDir(plugin), getVaultAbsolutePath(plugin.app));
		new Notice('AI conventions skill installed.');
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Skill install failed: ${msg}`, 10000);
	}
}
