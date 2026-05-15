import { App, PluginSettingTab, Setting } from 'obsidian';
import type ObsiPrintPlugin from './main';

export interface ObsiPrintSettings {
	/** Absolute or vault-relative path where the final PDF is copied after a successful build. */
	outputPath: string;
	/** Open the generated PDF automatically after a successful export. */
	autoOpenPdf: boolean;
}

export const DEFAULT_SETTINGS: ObsiPrintSettings = {
	outputPath: '',
	autoOpenPdf: false,
};

export class ObsiPrintSettingTab extends PluginSettingTab {
	plugin: ObsiPrintPlugin;

	constructor(app: App, plugin: ObsiPrintPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Obsi Print' });
		containerEl.createEl('h3', { text: 'Output' });

		new Setting(containerEl)
			.setName('Output path')
			.setDesc(
				'Leave empty to place the PDF next to the source note. Paths without leading / are vault-relative. Paths starting with / or ~/ are treated as absolute.',
			)
			.addText((text) => {
				text
					.setPlaceholder('Example: exports/manual.pdf or ~/Desktop/output.pdf')
					.setValue(this.plugin.settings.outputPath)
					.onChange(async (value) => {
						this.plugin.settings.outputPath = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Auto-open PDF after export')
			.setDesc('Open the generated PDF automatically when export succeeds.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoOpenPdf).onChange(async (value) => {
					this.plugin.settings.autoOpenPdf = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
