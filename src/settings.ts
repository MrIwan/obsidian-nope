import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from 'obsidian';
import type AtomicPressPlugin from './main';
import type { AtomicPressSettings, PreflightResults } from './types';
import { runPreflightChecks } from './utils/preflight';
import { DOCKER_IMAGE_NAME, buildImage, imageExists } from './utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath } from './utils/paths';
import { cleanupBuild, installAiSkill, removeDockerImage } from './commands/maintenance';
import { getSkillStatus, type SkillStatus } from './utils/skill';

export const DEFAULT_SETTINGS: AtomicPressSettings = {
	outputPath: '',
	autoOpenPdf: false,
	keepLatexIntermediates: false,
};

export class AtomicPressSettingTab extends PluginSettingTab {
	plugin: AtomicPressPlugin;

	constructor(app: App, plugin: AtomicPressPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Output configuration section.
		new Setting(containerEl).setName('Output').setHeading();

		new Setting(containerEl)
			.setName('Output path')
			.setDesc(
				'Empty = same folder as the source note. ' +
					'Without leading "/" → relative to the vault root. ' +
					'Leading "/" or "~/" → absolute path.',
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

		new Setting(containerEl)
			.setName('Keep LaTeX intermediates after build')
			.setDesc(
				'Off (default): delete pipeline/build/<doc>/ after a successful export — the PDF is already in the vault. ' +
					'On: keep .tex/.log/.aux/… for debugging.',
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.keepLatexIntermediates)
					.onChange(async (value) => {
						this.plugin.settings.keepLatexIntermediates = value;
						await this.plugin.saveSettings();
					});
			});

		// System preflight checks section.
		new Setting(containerEl).setName('Preflight').setHeading();

		const preflightResultsDiv = containerEl.createEl('div');

		const renderPreflightResults = (res: PreflightResults) => {
			preflightResultsDiv.empty();
			for (const c of res.checks) {
				const row = preflightResultsDiv.createEl('div');
				row.createEl('strong', { text: c.passed ? '✓ ' : '✗ ' });
				row.createEl('span', { text: c.name });
				row.createEl('div', { text: c.message });
			}
		};

		new Setting(containerEl)
			.setName('System checks')
			.setDesc('Verify that the docker CLI and daemon are available.')
			.addButton((btn) => {
				btn.setButtonText('Re-check').onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Checking…');
					try {
						const res = await runPreflightChecks(this.app);
						renderPreflightResults(res);
					} catch (e) {
						preflightResultsDiv.setText(
							`Error: ${e instanceof Error ? e.message : String(e)}`,
						);
					} finally {
						btn.setDisabled(false);
						btn.setButtonText('Re-check');
					}
				});
			});

		// Auto-run preflight checks on tab open.
		void runPreflightChecks(this.app)
			.then(renderPreflightResults)
			.catch(() => {
				/* errors will surface when user clicks Re-check */
			});

		// Docker image setup section.
		new Setting(containerEl).setName('Setup').setHeading();

		const setupStatusDiv = containerEl.createEl('div', { text: 'Checking image…' });
		let buildBtnRef: ButtonComponent | null = null;

		const refreshImageStatus = async () => {
			const exists = await imageExists();
			if (exists) {
				setupStatusDiv.setText(`✓ Docker image "${DOCKER_IMAGE_NAME}" is built.`);
				buildBtnRef?.setButtonText('Rebuild image');
			} else {
				setupStatusDiv.setText(`✗ Docker image "${DOCKER_IMAGE_NAME}" is not built yet.`);
				buildBtnRef?.setButtonText('Build image');
			}
		};

		new Setting(containerEl)
			.setName('Docker image')
			.setDesc(
				'Build the pipeline image. log is written to pipeline/build/last-build.log in Plugin folder.',
			)
			.addButton((btn) => {
				buildBtnRef = btn;
				btn.setButtonText('Build image').onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Building… (this may take 5–15 minutes)');
					try {
						const pluginDir = getPluginAbsoluteDir(this.plugin);
						await buildImage(pluginDir, true);
						new Notice('Docker image build complete.');
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						new Notice(`Build failed: ${msg}`);
					} finally {
						btn.setDisabled(false);
						await refreshImageStatus();
					}
				});
			});

		void refreshImageStatus();

		// System maintenance section.
		new Setting(containerEl).setName('Maintenance').setHeading();

		new Setting(containerEl)
			.setName('Remove docker image')
			.setDesc(`Delete the "${DOCKER_IMAGE_NAME}" image. A subsequent export will rebuild it.`)
			.addButton((btn) => {
				btn.setButtonText('Remove').onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Removing…');
					try {
						await removeDockerImage();
					} finally {
						btn.setDisabled(false);
						btn.setButtonText('Remove');
						await refreshImageStatus();
					}
				});
			});

		new Setting(containerEl)
			.setName('Cleanup build folder')
			.setDesc('Delete everything inside pipeline/build/ (logs and per-doc intermediates).')
			.addButton((btn) => {
				btn.setButtonText('Cleanup').onClick(() => {
					btn.setDisabled(true);
					btn.setButtonText('Cleaning…');
					try {
						cleanupBuild(this.plugin);
					} finally {
						btn.setDisabled(false);
						btn.setButtonText('Cleanup');
					}
				});
			});

		// AI skill installation and status section.
		new Setting(containerEl).setName('AI conventions skill').setHeading();

		const skillStatusDiv = containerEl.createEl('div');
		let skillBtnRef: ButtonComponent | null = null;

		const refreshSkillStatus = () => {
			const status = getSkillStatus(
				getPluginAbsoluteDir(this.plugin),
				getVaultAbsolutePath(this.app),
			);
			skillStatusDiv.setText(SKILL_STATUS_LABEL[status]);
			skillBtnRef?.setButtonText(SKILL_BUTTON_LABEL[status]);
		};

		new Setting(containerEl)
			.setName('Install / update')
			.setDesc(
				'Copy skill/SKILL.md → <vault>/.claude/skills/atomic-press/SKILL.md. ' +
					'Overwrites any existing file at the target.',
			)
			.addButton((btn) => {
				skillBtnRef = btn;
				btn.onClick(() => {
					btn.setDisabled(true);
					btn.setButtonText('Installing…');
					try {
						installAiSkill(this.plugin);
					} finally {
						btn.setDisabled(false);
						refreshSkillStatus();
					}
				});
			});

		refreshSkillStatus();
	}
}

const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
	missing: '✗ Skill not installed.',
	outdated: '⚠ Skill outdated.',
	current: '✓ Skill up to date.',
};

const SKILL_BUTTON_LABEL: Record<SkillStatus, string> = {
	missing: 'Install',
	outdated: 'Update',
	current: 'Reinstall',
};
