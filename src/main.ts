import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, ObsiPrintSettingTab } from './settings';
import type { ObsiPrintSettings } from './types';
import { registerExportCommand } from './commands/export';
import { registerBuildCommand } from './commands/build';
import { registerBrandingTemplateCommand } from './commands/branding-template';
import { registerMaintenanceCommands } from './commands/maintenance';

export default class ObsiPrintPlugin extends Plugin {
	settings!: ObsiPrintSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ObsiPrintSettingTab(this.app, this));
		registerExportCommand(this);
		registerBuildCommand(this);
		registerBrandingTemplateCommand(this);
		registerMaintenanceCommands(this);
	}

	onunload() {
		// No-op for now. Add cleanup here when long-running listeners are registered.
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ObsiPrintSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
