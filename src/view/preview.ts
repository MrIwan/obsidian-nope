// PDF preview view: renders the active note via the export pipeline and shows the build PDF inline.
// Auto mode watches the dependency set from the last render and re-renders on changes.

import { ItemView, Notice, TFile, ToggleComponent, WorkspaceLeaf, debounce, normalizePath } from 'obsidian';
import type { Debouncer, ViewStateResult } from 'obsidian';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type NopePlugin from '../main';
import { runExport } from '../utils/export';
import type { ProgressReporter } from '../utils/export';
import { getPluginAbsoluteDir } from '../utils/paths';
import { cleanupIntermediates } from '../utils/docker';

export const NOPE_PREVIEW_VIEW_TYPE = 'nope-pdf-preview';

const RENDER_DEBOUNCE_MS = 3000;

interface PreviewState {
	filePath: string | null;
	autoRender: boolean;
}

export class NopePreviewView extends ItemView {
	private plugin: NopePlugin;
	private filePath: string | null = null;
	private autoRender = false;
	private rendering = false;
	private pending = false;
	private watchSet = new Set<string>();
	private debouncedRender: Debouncer<[], void>;
	private renderButton: HTMLButtonElement | null = null;
	private autoToggle: ToggleComponent | null = null;
	private statusEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: NopePlugin) {
		super(leaf);
		this.plugin = plugin;
		// Trailing debounce with reset: a burst of saves yields exactly one render after quiet time.
		this.debouncedRender = debounce(() => this.requestRender(), RENDER_DEBOUNCE_MS, true);
	}

	getViewType(): string {
		return NOPE_PREVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		const file = this.getFile();
		return file ? `PDF preview — ${file.basename}` : 'PDF preview';
	}

	getIcon(): string {
		return 'printer';
	}

	get boundFilePath(): string | null {
		return this.filePath;
	}

	getState(): Record<string, unknown> {
		return { filePath: this.filePath, autoRender: this.autoRender };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Partial<PreviewState> | null;
		const previousPath = this.filePath;
		this.filePath = typeof s?.filePath === 'string' ? s.filePath : null;
		this.autoRender = s?.autoRender === true;
		// Re-binding to another note invalidates the old dependency set and its build folder.
		if (this.filePath !== previousPath) {
			if (previousPath) this.cleanupFor(previousPath);
			this.watchSet = new Set(this.filePath ? [this.filePath] : []);
		}
		this.autoToggle?.setValue(this.autoRender);
		this.refreshBody();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('nope-preview-content');

		const toolbar = this.contentEl.createDiv({ cls: 'nope-preview-toolbar' });
		this.renderButton = toolbar.createEl('button', { text: 'Render now' });
		this.renderButton.addEventListener('click', () => this.requestRender());

		const autoWrap = toolbar.createDiv({ cls: 'nope-preview-auto' });
		this.autoToggle = new ToggleComponent(autoWrap);
		this.autoToggle.setValue(this.autoRender);
		this.autoToggle.setTooltip('Re-render automatically when an included note changes');
		this.autoToggle.onChange((value) => {
			this.autoRender = value;
			this.app.workspace.requestSaveLayout();
			// Render on enable so the watch set reflects the current document.
			if (value) this.requestRender();
		});
		autoWrap.createSpan({ cls: 'nope-preview-auto-label', text: 'Auto-render' });

		this.statusEl = toolbar.createSpan({ cls: 'nope-preview-status' });

		this.bodyEl = this.contentEl.createDiv({ cls: 'nope-preview-body' });
		this.refreshBody();

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!this.autoRender || !(file instanceof TFile)) return;
				if (!this.watchSet.has(file.path)) return;
				this.debouncedRender();
			}),
		);
		// Keep the binding alive when the bound note is renamed.
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && oldPath === this.filePath) {
					this.filePath = file.path;
					this.watchSet = new Set([file.path]);
					this.app.workspace.requestSaveLayout();
				}
			}),
		);
	}

	onClose(): Promise<void> {
		this.debouncedRender.cancel();
		this.cleanupFor(this.filePath);
		return Promise.resolve();
	}

	// The preview forces keep-intermediates while open; closing restores the user's setting.
	private cleanupFor(path: string | null): void {
		if (!path || this.plugin.settings.keepLatexIntermediates) return;
		// A render in flight would recreate the folder mid-delete; next session cleans up normally.
		if (this.rendering) return;
		const base = (path.split('/').pop() ?? path).replace(/\.md$/i, '');
		cleanupIntermediates(join(getPluginAbsoluteDir(this.plugin), 'pipeline', 'build', base));
	}

	private getFile(): TFile | null {
		if (!this.filePath) return null;
		return this.app.vault.getFileByPath(this.filePath);
	}

	// Build PDF lives inside the plugin dir, hence vault-relative and servable via getResourcePath.
	private pdfPaths(file: TFile): { abs: string; vaultRel: string } {
		const base = file.basename;
		const abs = join(getPluginAbsoluteDir(this.plugin), 'pipeline', 'build', base, `${base}.pdf`);
		const relDir =
			this.plugin.manifest.dir ??
			`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
		const vaultRel = normalizePath(`${relDir}/pipeline/build/${base}/${base}.pdf`);
		return { abs, vaultRel };
	}

	private setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
		if (!this.statusEl) return;
		this.statusEl.setText(message);
		this.statusEl.toggleClass('nope-preview-status-error', kind === 'error');
	}

	private refreshBody(): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();
		const file = this.getFile();
		if (!file) {
			this.bodyEl.createDiv({
				cls: 'nope-preview-empty',
				text: 'No note bound — run "Open PDF preview" from a note.',
			});
			return;
		}
		const { abs, vaultRel } = this.pdfPaths(file);
		if (!existsSync(abs)) {
			this.bodyEl.createDiv({
				cls: 'nope-preview-empty',
				text: `No PDF yet for "${file.basename}" — click "Render now".`,
			});
			return;
		}
		// Fresh getResourcePath per refresh: the mtime query param is the cache-bust.
		const src = this.app.vault.adapter.getResourcePath(vaultRel);
		this.bodyEl.createEl('embed', {
			cls: 'nope-preview-embed',
			attr: { type: 'application/pdf', src },
		});
	}

	// Last good PDF stays visible; the banner sits above it and is replaced on the next attempt.
	private showErrorBanner(message: string): void {
		if (!this.bodyEl) return;
		this.clearErrorBanner();
		const banner = this.bodyEl.createDiv({ cls: 'nope-preview-banner' });
		banner.createDiv({ cls: 'nope-preview-banner-message', text: message });
		const excerpt = this.readLatexLogExcerpt();
		if (excerpt) {
			banner.createDiv({ cls: 'nope-preview-banner-log', text: excerpt });
		}
		banner.setAttribute('aria-label', 'Click to dismiss');
		banner.addEventListener('click', () => banner.remove());
		this.bodyEl.prepend(banner);
	}

	private clearErrorBanner(): void {
		this.bodyEl?.querySelector('.nope-preview-banner')?.remove();
	}

	// Pull the first LaTeX error ("!"-line) or the last lines as fallback from the run log.
	private readLatexLogExcerpt(): string | null {
		const logPath = join(getPluginAbsoluteDir(this.plugin), 'pipeline', 'build', 'last_latex_run.log');
		if (!existsSync(logPath)) return null;
		try {
			const lines = readFileSync(logPath, 'utf8').split('\n');
			const errIndex = lines.findIndex((l) => l.startsWith('!'));
			const picked =
				errIndex >= 0
					? lines.slice(errIndex, errIndex + 3)
					: lines.filter((l) => l.trim() !== '').slice(-5);
			const text = picked.join('\n').trim();
			return text === '' ? null : text;
		} catch {
			return null;
		}
	}

	// Single entry point for manual clicks, auto triggers, and toggle-on renders.
	private requestRender(): void {
		if (this.rendering) {
			this.pending = true;
			return;
		}
		void this.render();
	}

	private async render(): Promise<void> {
		if (this.rendering) return;
		const file = this.getFile();
		if (!file) {
			this.setStatus('No note bound to this preview.', 'error');
			return;
		}
		this.rendering = true;
		if (this.renderButton) this.renderButton.disabled = true;
		// Status line doubles as the progress reporter; no notices in the preview.
		const reporter: ProgressReporter = {
			update: (m) => this.setStatus(m),
			succeed: (m) => this.setStatus(m),
			fail: (m) => this.setStatus(m, 'error'),
		};
		try {
			const result = await runExport(this.plugin, file, {
				reporter,
				keepIntermediates: true,
				copyToDestination: false,
				openPdf: false,
			});
			if (result.deps) {
				this.watchSet = new Set(result.deps);
			}
			if (result.ok) {
				this.refreshBody();
			} else {
				this.showErrorBanner('Render failed — showing the last successful PDF.');
			}
		} finally {
			this.rendering = false;
			if (this.renderButton) this.renderButton.disabled = false;
			// Exactly one queued re-render coalesces everything that arrived meanwhile.
			if (this.pending) {
				this.pending = false;
				void this.render();
			}
		}
	}
}

export function registerPreviewCommand(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'open-pdf-preview',
		name: 'Open PDF preview',
		callback: async () => {
			const active = plugin.app.workspace.getActiveFile();
			const mdFile = active && active.extension.toLowerCase() === 'md' ? active : null;

			const existing = plugin.app.workspace.getLeavesOfType(NOPE_PREVIEW_VIEW_TYPE)[0];
			const existingView = existing?.view instanceof NopePreviewView ? existing.view : null;
			const targetPath = mdFile?.path ?? existingView?.boundFilePath ?? null;
			if (!targetPath) {
				new Notice('Open a note first, then open the PDF preview.');
				return;
			}

			const leaf = existing ?? plugin.app.workspace.getLeaf('split', 'vertical');
			await leaf.setViewState({
				type: NOPE_PREVIEW_VIEW_TYPE,
				active: true,
				state: { filePath: targetPath, autoRender: existingView?.getState().autoRender === true },
			});
			await plugin.app.workspace.revealLeaf(leaf);
		},
	});
}
