import { App, PluginSettingTab, Setting } from 'obsidian';
import type ObsiPrintPlugin from './main';
import type { ObsiPrintSettings, PreflightResults } from './types';
import { runPreflightChecks } from './utils/preflight';

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

		// Simple example Preflight runner (returns mock/example results)
		containerEl.createEl('h3', { text: 'Preflight (example)' });

		const resultsDiv = containerEl.createEl('div');

		new Setting(containerEl).addButton((btn) => {
			btn.setButtonText('Run Preflight (Example)').onClick(async () => {
				btn.setButtonText('Checking...');
				try {
					const res: PreflightResults = await runPreflightChecks(this.app);
					resultsDiv.innerHTML = '';
					for (const c of res.checks) {
						const row = resultsDiv.createEl('div');
						row.createEl('strong', { text: c.passed ? '✓ ' : '✗ ' });
						row.createEl('span', { text: c.name });
						row.createEl('div', { text: c.message });
					}
					console.log('Preflight results:', res);
				} catch (e) {
					resultsDiv.innerText = `Error running preflight: ${e instanceof Error ? e.message : String(e)}`;
				} finally {
					btn.setButtonText('Run Preflight (Example)');
				}
			});
		});
	}
}
