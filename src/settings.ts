/** The settings tab and the default settings. */
import { App, ButtonComponent, Notice, PluginSettingTab, Setting, SettingGroup, TextComponent } from 'obsidian';
import type { SettingDefinition, SettingDefinitionItem } from 'obsidian';
import { remote } from 'electron';
import type NopePlugin from './main';
import type { NopeSettings, PreflightResults } from './types';
import { runPreflightChecks } from './utils/preflight';
import { PREBUILT_IMAGE_REPO, buildImage, detectDockerBin, setDockerPathOverride, setImageTagOverride, setUsePrebuiltImage } from './utils/docker';
import { ProgressNotice, parseBuildStep } from './utils/progress';
import { getPluginAbsoluteDir, getVaultAbsolutePath } from './utils/paths';
import { cleanupBuild, installAiSkill, removeDockerImage } from './commands/maintenance';
import { getSkillStatus, type SkillStatus } from './utils/skill';

/** Default plugin settings. */
export const DEFAULT_SETTINGS: NopeSettings = {
	outputPath: '',
	autoOpenPdf: false,
	followOnModClick: true,
	keepLatexIntermediates: false,
	dockerPath: '',
	previewAutoRender: false,
	usePrebuiltImage: true,
	imageTag: '',
};

const USE_PREBUILT_DESC =
	`On (default): pull the release image from ${PREBUILT_IMAGE_REPO} and only add extra LaTeX packages locally (fast, bit-identical for all users). ` +
	'Off: build everything locally from pipeline/Dockerfile.';

const IMAGE_TAG_DESC =
	'Prebuilt image only. Empty = tag matching the plugin version. Set a specific tag (e.g. test-x) to try a CI build without a release.';

/**
 * The NOPE settings tab: preflight chips, Docker path and image controls, the AI
 * skill status and the general toggles. Implements getSettingDefinitions() (Obsidian
 * 1.13+) plus a display() fallback. Both must be patched when settings change.
 */
export class NopeSettingTab extends PluginSettingTab {
	plugin: NopePlugin;
	// Shared across render callbacks so docker actions can re-run the preflight chain.
	private dockerRefresh: (() => Promise<void>) | undefined;

	constructor(app: App, plugin: NopePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// Declarative settings (Obsidian 1.13+). Kept cheap: only closures, no I/O here —
	// the docker preflight runs inside the render callbacks, not during indexing.
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			// General settings first, without a heading (plugin guidelines).
			{
				name: 'Output path',
				desc:
					'Empty = same folder as the source note. ' +
					'Without leading "/" → relative to the vault root. ' +
					'Leading "/" or "~/" → absolute path.',
				control: {
					type: 'text',
					key: 'outputPath',
					placeholder: 'Example: exports/manual.pdf or ~/Desktop/output.pdf',
				},
			},
			{
				name: 'Auto-open PDF after export',
				desc: 'Open the generated PDF automatically when export succeeds.',
				control: { type: 'toggle', key: 'autoOpenPdf' },
			},
			{
				name: 'Follow on Ctrl/Cmd+click',
				desc:
					'In a note that is part of the previewed document: Ctrl/Cmd+click syncs the PDF preview to the clicked position. ' +
					'In the PDF preview: Ctrl/Cmd+click opens the note rendered there, even while the click-to-open toggle is off.',
				control: { type: 'toggle', key: 'followOnModClick' },
			},
			{
				name: 'Keep LaTeX intermediates after build',
				desc:
					'Off (default): delete pipeline/build/<doc>/ after a successful export — the PDF is already in the vault. ' +
					'On: keep .tex/.log/.aux/… for debugging.',
				control: { type: 'toggle', key: 'keepLatexIntermediates' },
			},
			{
				name: 'Cleanup build folder',
				desc: 'Delete everything inside pipeline/build/ (logs and per-doc intermediates).',
				render: (setting: Setting): void => {
					setting.addButton((btn) => {
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
				},
			},
			{ type: 'group', heading: 'Docker', items: this.dockerItems() },
			{ type: 'group', heading: 'AI conventions skill', items: this.skillItems() },
		];
	}

	// Imperative fallback for Obsidian <1.13 only — 1.13+ ignores display() because getSettingDefinitions() returns a non-empty array 
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// General settings stay at the top without a heading (plugin guidelines).
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
			.setName('Follow on Ctrl/Cmd+click')
			.setDesc(
				'In a note that is part of the previewed document: Ctrl/Cmd+click syncs the PDF preview to the clicked position. ' +
					'In the PDF preview: Ctrl/Cmd+click opens the note rendered there, even while the click-to-open toggle is off.',
			)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.followOnModClick).onChange(async (value) => {
					this.plugin.settings.followOnModClick = value;
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

		// Docker section: status chain, binary path, image build.
		new Setting(containerEl).setName('Docker').setHeading();

		const chipsEl = containerEl.createDiv({ cls: 'nope-status-chips' });
		const detailsEl = containerEl.createDiv({ cls: 'nope-status-details' });

		// Chips mirror the check chain; failures repeat their message below the row.
		const renderChecks = (res: PreflightResults) => {
			chipsEl.empty();
			detailsEl.empty();
			for (const c of res.checks) {
				const state = c.skipped ? 'nope-chip-skipped' : c.passed ? 'nope-chip-ok' : 'nope-chip-fail';
				chipsEl.createSpan({ cls: `nope-chip ${state}`, text: c.name, attr: { 'aria-label': c.message } });
				if (!c.passed && !c.skipped) detailsEl.createDiv({ text: `${c.name}: ${c.message}` });
			}
		};
		const refreshChecks = async () => {
			try {
				renderChecks(await runPreflightChecks());
			} catch (e) {
				detailsEl.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
			}
		};
		// Shared with runImageBuild and the path buttons, same contract as the declarative path.
		this.dockerRefresh = refreshChecks;

		new Setting(containerEl)
			.setName('Status')
			.setDesc('Checks run in order: CLI → daemon → image. Hover a chip for details.')
			.addButton((btn) => {
				btn.setButtonText('Re-check').onClick(async () => {
					btn.setDisabled(true);
					await refreshChecks();
					btn.setDisabled(false);
				});
			});

		void refreshChecks();

		const detectPlaceholder = () => detectDockerBin() ?? 'Not found — set a path or install Docker';
		let dockerPathText: TextComponent | null = null;

		new Setting(containerEl)
			.setName('Docker path')
			.setDesc('Empty = auto-detect common install locations (shown as placeholder). Set only for non-standard installs.')
			.addText((text) => {
				dockerPathText = text;
				text
					.setPlaceholder(detectPlaceholder())
					.setValue(this.plugin.settings.dockerPath)
					.onChange(async (value) => {
						this.plugin.settings.dockerPath = value.trim();
						setDockerPathOverride(value);
						await this.plugin.saveSettings();
					});
			})
			.addButton((btn) => {
				btn.setIcon('folder-open').setTooltip('Browse for the docker binary').onClick(async () => {
					const result = await remote.dialog.showOpenDialog({
						title: 'Select the docker binary',
						properties: ['openFile', 'showHiddenFiles'],
					});
					const picked = result.filePaths[0];
					if (result.canceled || !picked) return;
					// setValue does not fire onChange, so persist explicitly.
					dockerPathText?.setValue(picked);
					this.plugin.settings.dockerPath = picked;
					setDockerPathOverride(picked);
					await this.plugin.saveSettings();
					await refreshChecks();
				});
			})
			.addButton((btn) => {
				btn.setButtonText('Auto-detect').onClick(async () => {
					const found = detectDockerBin();
					dockerPathText?.setPlaceholder(detectPlaceholder());
					new Notice(found ? `Found: ${found}` : 'Docker not found in common install locations.');
					await refreshChecks();
				});
			});

		new Setting(containerEl)
			.setName('Use prebuilt image')
			.setDesc(USE_PREBUILT_DESC)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.usePrebuiltImage).onChange(async (value) => {
					this.plugin.settings.usePrebuiltImage = value;
					setUsePrebuiltImage(value);
					await this.plugin.saveSettings();
					await refreshChecks();
				});
			});

		new Setting(containerEl)
			.setName('Image tag override')
			.setDesc(IMAGE_TAG_DESC)
			.addText((text) => {
				text
					.setPlaceholder(this.plugin.manifest.version)
					.setValue(this.plugin.settings.imageTag)
					.onChange(async (value) => {
						this.plugin.settings.imageTag = value.trim();
						setImageTagOverride(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Docker image')
			.setDesc('Build uses the layer cache; "no cache" rebuilds everything. Log: pipeline/build/last-build.log.')
			.addButton((btn) => {
				btn.setButtonText('Build').onClick(() => this.runImageBuild(btn, false));
			})
			.addButton((btn) => {
				btn.setButtonText('Build (no cache)').onClick(() => this.runImageBuild(btn, true));
			})
			.addButton((btn) => {
				btn.setButtonText('Remove').setTooltip('Delete the image; the next export rebuilds it').onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Removing…');
					try {
						await removeDockerImage();
					} finally {
						btn.setDisabled(false);
						btn.setButtonText('Remove');
						await refreshChecks();
					}
				});
			});

		// AI skill installation and status section.
		new Setting(containerEl).setName('AI conventions skill').setHeading();

		const skillChipsEl = containerEl.createDiv({ cls: 'nope-status-chips' });
		const skillDetailsEl = containerEl.createDiv({ cls: 'nope-status-details' });
		let skillBtnRef: ButtonComponent | null = null;

		const refreshSkillStatus = () => {
			const status = getSkillStatus(
				getPluginAbsoluteDir(this.plugin),
				getVaultAbsolutePath(this.app),
			);
			skillChipsEl.empty();
			skillChipsEl.createSpan({
				cls: `nope-chip ${SKILL_CHIP_CLASS[status]}`,
				text: 'AI skill',
				attr: { 'aria-label': SKILL_STATUS_LABEL[status] },
			});
			skillDetailsEl.setText(SKILL_STATUS_LABEL[status]);
			skillBtnRef?.setButtonText(SKILL_BUTTON_LABEL[status]);
		};

		new Setting(containerEl)
			.setName('Install / update')
			.setDesc(
				'Copy skill/SKILL.md → <vault>/.claude/skills/nope/SKILL.md. ' +
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

	// Docker section: status chain, binary path, image build.
	private dockerItems(): SettingDefinition[] {
		return [
			{
				name: 'Status',
				desc: 'Checks run in order: CLI → daemon → image. Hover a chip for details.',
				render: (setting: Setting, group: SettingGroup): void => {
					const chipsEl = group.listEl.createDiv({ cls: 'nope-status-chips' });
					const detailsEl = group.listEl.createDiv({ cls: 'nope-status-details' });

					// Chips mirror the check chain; failures repeat their message below the row.
					const renderChecks = (res: PreflightResults) => {
						chipsEl.empty();
						detailsEl.empty();
						for (const c of res.checks) {
							const state = c.skipped ? 'nope-chip-skipped' : c.passed ? 'nope-chip-ok' : 'nope-chip-fail';
							chipsEl.createSpan({ cls: `nope-chip ${state}`, text: c.name, attr: { 'aria-label': c.message } });
							if (!c.passed && !c.skipped) detailsEl.createDiv({ text: `${c.name}: ${c.message}` });
						}
					};
					const refresh = async () => {
						try {
							renderChecks(await runPreflightChecks());
						} catch (e) {
							detailsEl.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
						}
					};
					this.dockerRefresh = refresh;

					setting.addButton((btn) => {
						btn.setButtonText('Re-check').onClick(async () => {
							btn.setDisabled(true);
							await refresh();
							btn.setDisabled(false);
						});
					});

					void refresh();
				},
			},
			{
				name: 'Docker path',
				desc: 'Empty = auto-detect common install locations (shown as placeholder). Set only for non-standard installs.',
				render: (setting: Setting): void => {
					const detectPlaceholder = () => detectDockerBin() ?? 'Not found — set a path or install Docker';
					let dockerPathText: TextComponent | null = null;

					setting
						.addText((text) => {
							dockerPathText = text;
							text
								.setPlaceholder(detectPlaceholder())
								.setValue(this.plugin.settings.dockerPath)
								.onChange(async (value) => {
									this.plugin.settings.dockerPath = value.trim();
									setDockerPathOverride(value);
									await this.plugin.saveSettings();
								});
						})
						.addButton((btn) => {
							btn.setIcon('folder-open').setTooltip('Browse for the docker binary').onClick(async () => {
								const result = await remote.dialog.showOpenDialog({
									title: 'Select the docker binary',
									properties: ['openFile', 'showHiddenFiles'],
								});
								const picked = result.filePaths[0];
								if (result.canceled || !picked) return;
								// setValue does not fire onChange, so persist explicitly.
								dockerPathText?.setValue(picked);
								this.plugin.settings.dockerPath = picked;
								setDockerPathOverride(picked);
								await this.plugin.saveSettings();
								await this.dockerRefresh?.();
							});
						})
						.addButton((btn) => {
							btn.setButtonText('Auto-detect').onClick(async () => {
								const found = detectDockerBin();
								dockerPathText?.setPlaceholder(detectPlaceholder());
								new Notice(found ? `Found: ${found}` : 'Docker not found in common install locations.');
								await this.dockerRefresh?.();
							});
						});
				},
			},
			{
				name: 'Use prebuilt image',
				desc: USE_PREBUILT_DESC,
				render: (setting: Setting): void => {
					setting.addToggle((toggle) => {
						toggle.setValue(this.plugin.settings.usePrebuiltImage).onChange(async (value) => {
							this.plugin.settings.usePrebuiltImage = value;
							setUsePrebuiltImage(value);
							await this.plugin.saveSettings();
							await this.dockerRefresh?.();
						});
					});
				},
			},
			{
				name: 'Image tag override',
				desc: IMAGE_TAG_DESC,
				render: (setting: Setting): void => {
					setting.addText((text) => {
						text
							.setPlaceholder(this.plugin.manifest.version)
							.setValue(this.plugin.settings.imageTag)
							.onChange(async (value) => {
								this.plugin.settings.imageTag = value.trim();
								setImageTagOverride(value);
								await this.plugin.saveSettings();
							});
					});
				},
			},
			{
				name: 'Docker image',
				desc: 'Build uses the layer cache; "no cache" rebuilds everything. Log: pipeline/build/last-build.log.',
				render: (setting: Setting): void => {
					setting
						.addButton((btn) => {
							btn.setButtonText('Build').onClick(() => this.runImageBuild(btn, false));
						})
						.addButton((btn) => {
							btn.setButtonText('Build (no cache)').onClick(() => this.runImageBuild(btn, true));
						})
						.addButton((btn) => {
							btn.setButtonText('Remove').setTooltip('Delete the image; the next export rebuilds it').onClick(async () => {
								btn.setDisabled(true);
								btn.setButtonText('Removing…');
								try {
									await removeDockerImage();
								} finally {
									btn.setDisabled(false);
									btn.setButtonText('Remove');
									await this.dockerRefresh?.();
								}
							});
						});
				},
			},
		];
	}

	// Shared build handler; cache off forces a clean rebuild of every layer.
	private async runImageBuild(btn: ButtonComponent, noCache: boolean, idleLabel?: string): Promise<void> {
		btn.setDisabled(true);
		btn.setButtonText('Building…');
		const label = noCache ? 'no cache, 5–15 min' : 'cached';
		const progress = new ProgressNotice(`Building docker image (${label})…`);
		try {
			const pluginDir = getPluginAbsoluteDir(this.plugin);
			await buildImage(pluginDir, noCache, (chunk) => {
				const step = parseBuildStep(chunk);
				if (step) progress.update(`Building docker image — ${step}`);
			});
			progress.succeed('Docker image build complete.');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			progress.fail(`Build failed: ${msg}`);
		} finally {
			btn.setDisabled(false);
			btn.setButtonText(idleLabel ?? (noCache ? 'Build (no cache)' : 'Build'));
			await this.dockerRefresh?.();
		}
	}

	// AI skill installation and status.
	private skillItems(): SettingDefinition[] {
		return [
			{
				name: 'Install / update',
				desc:
					'Copy skill/SKILL.md → <vault>/.claude/skills/nope/SKILL.md. ' +
					'Overwrites any existing file at the target.',
				render: (setting: Setting, group: SettingGroup): void => {
					const skillChipsEl = group.listEl.createDiv({ cls: 'nope-status-chips' });
					const skillDetailsEl = group.listEl.createDiv({ cls: 'nope-status-details' });
					let skillBtnRef: ButtonComponent | null = null;

					const refreshSkillStatus = () => {
						const status = getSkillStatus(
							getPluginAbsoluteDir(this.plugin),
							getVaultAbsolutePath(this.app),
						);
						skillChipsEl.empty();
						skillChipsEl.createSpan({
							cls: `nope-chip ${SKILL_CHIP_CLASS[status]}`,
							text: 'AI skill',
							attr: { 'aria-label': SKILL_STATUS_LABEL[status] },
						});
						skillDetailsEl.setText(SKILL_STATUS_LABEL[status]);
						skillBtnRef?.setButtonText(SKILL_BUTTON_LABEL[status]);
					};

					setting.addButton((btn) => {
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
				},
			},
		];
	}
}

const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
	missing: 'Skill not installed.',
	outdated: 'Skill outdated — installed copy differs from the bundled version.',
	current: 'Skill up to date.',
};

const SKILL_CHIP_CLASS: Record<SkillStatus, string> = {
	missing: 'nope-chip-fail',
	outdated: 'nope-chip-warn',
	current: 'nope-chip-ok',
};

const SKILL_BUTTON_LABEL: Record<SkillStatus, string> = {
	missing: 'Install',
	outdated: 'Update',
	current: 'Reinstall',
};
