import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, NopeSettingTab } from './settings';
import type { NopeSettings } from './types';
import { registerExportCommand } from './commands/export';
import { registerBuildCommand, registerBuildCommandnoCache } from './commands/build';
import { registerBrandingTemplateCommand } from './commands/branding-template';
import { registerCustomTemplateCommand } from './commands/custom-template';
import { registerEnvTemplateCommands } from './commands/env-templates';
import { registerMaintenanceCommands } from './commands/maintenance';
import { NOPE_PREVIEW_VIEW_TYPE, NopePreviewView, registerPreviewClickOpenToggleCommand, registerPreviewCommand, registerPreviewSyncCommand } from './view/preview';
import { getPluginAbsoluteDir } from './utils/paths';
import { ensureBundledAssets } from './utils/assets';
import { setDockerPathOverride } from './utils/docker';
import { registerBasesExportView } from './utils/bases';

export default class NopePlugin extends Plugin {
	settings!: NopeSettings;

	async onload() {
		await this.loadSettings();
		setDockerPathOverride(this.settings.dockerPath);

		// Materialize bundled pipeline/ + skill/ files so installs that only
		// deliver main.js (BRAT/store) still have the full toolchain on disk.
		try {
			ensureBundledAssets(getPluginAbsoluteDir(this), this.manifest.version);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`NOPE: could not set up pipeline files. ${msg}`, 10000);
		}

		this.registerView(NOPE_PREVIEW_VIEW_TYPE, (leaf) => new NopePreviewView(leaf, this));

		this.addSettingTab(new NopeSettingTab(this.app, this));
		registerExportCommand(this);
		registerPreviewCommand(this);
		registerPreviewSyncCommand(this);
		registerPreviewClickOpenToggleCommand(this);
		registerBuildCommand(this);
		registerBuildCommandnoCache(this);
		registerBrandingTemplateCommand(this);
		registerCustomTemplateCommand(this);
		registerEnvTemplateCommands(this);
		registerMaintenanceCommands(this);
		registerBasesExportView(this);
	}

	onunload() {
		// Cleanup will be added when long-running listeners are registered.
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<NopeSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
