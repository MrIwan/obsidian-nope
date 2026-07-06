// PDF preview view: renders the active note via the export pipeline and shows the build PDF inline.
// Auto mode watches the dependency set from the last render and re-renders on changes.

import { ItemView, Keymap, MarkdownView, Menu, Notice, TFile, WorkspaceLeaf, debounce, setIcon } from 'obsidian';
import type { App, Debouncer, Editor, ViewStateResult } from 'obsidian';
import { remote, shell } from 'electron';
import { copyFileSync, existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-worker-inline';
import type NopePlugin from '../main';
import { runExport } from '../utils/export';
import type { ProgressReporter } from '../utils/export';
import { getPluginAbsoluteDir } from '../utils/paths';
import { cleanupIntermediates } from '../utils/docker';
import { pandocAutoIdentifier, parseAuxDestinations, sanitizeLabelId } from '../utils/pdf-anchors';

// Ship the worker inside main.js: turn the inlined source into a blob-URL worker.
pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
	URL.createObjectURL(new Blob([pdfWorkerSrc], { type: 'text/javascript' })),
	{ type: 'module' },
);

export const NOPE_PREVIEW_VIEW_TYPE = 'nope-pdf-preview';

const RENDER_DEBOUNCE_MS = 3000;

interface PreviewState {
	filePath: string | null;
	autoRender: boolean;
	clickOpen: boolean;
	zoom: number;
}

// A named destination resolved to its physical position (page + y from page bottom).
interface AnchorPos {
	page: number;
	top: number | null;
	name: string;
}

// Anchor candidates for the cursor position, most specific first; shared by toolbar sync and mod-click follow.
function cursorAnchorCandidates(app: App, editor: Editor, file: TFile): string[] {
	const line = editor.getCursor().line;
	const headings = app.metadataCache.getFileCache(file)?.headings ?? [];
	let slug: string | null = null;
	for (const h of headings) {
		if (h.position.start.line > line) break;
		slug = pandocAutoIdentifier(h.heading);
	}
	const base = sanitizeLabelId(file.basename);
	return [...(slug ? [slug] : []), `note:${base}`, `tab:${base}`, `eq:${base}`, `fig:${base}`];
}

// Vertical target (PDF user-space, from page bottom) of an explicit destination,
// or null when the fit type carries none. hyperref anchors are XYZ → top in [3].
function destTop(dest: unknown[]): number | null {
	const fit = dest[1] as { name?: string } | undefined;
	let v: unknown;
	if (fit?.name === 'XYZ') v = dest[3];
	else if (fit?.name === 'FitH' || fit?.name === 'FitBH') v = dest[2];
	else if (fit?.name === 'FitR') v = dest[5];
	else return null;
	return typeof v === 'number' ? v : null;
}

export class NopePreviewView extends ItemView {
	private plugin: NopePlugin;
	private filePath: string | null = null;
	private autoRender = false;
	private clickOpen = false;
	private rendering = false;
	private pending = false;
	private watchSet = new Set<string>();
	private lastAnchor: { candidate: string; dest: string } | null = null;
	private destCache: Map<string, string> | null = null;
	private anchorIndex: AnchorPos[] | null = null;
	private lastEditorLeaf: WorkspaceLeaf | null = null;
	private debouncedRender: Debouncer<[], void>;
	private renderButton: HTMLElement | null = null;
	private clickOpenButton: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;
	private pagesEl: HTMLElement | null = null;
	private pdfDoc: PDFDocumentProxy | null = null;
	private loadedKey: string | null = null;
	private renderToken = 0;
	private zoom = 1;
	private numPages = 0;
	private scrollToPageAfterRender: number | null = null;
	private pageTick = false;
	private pageInput: HTMLInputElement | null = null;
	private pageTotalEl: HTMLElement | null = null;
	private zoomLabel: HTMLElement | null = null;

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
		return {
			filePath: this.filePath,
			autoRender: this.autoRender,
			clickOpen: this.clickOpen,
			zoom: this.zoom,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Partial<PreviewState> | null;
		const previousPath = this.filePath;
		this.filePath = typeof s?.filePath === 'string' ? s.filePath : null;
		this.autoRender = s?.autoRender === true;
		this.clickOpen = s?.clickOpen === true;
		this.zoom = typeof s?.zoom === 'number' && s.zoom > 0 ? s.zoom : 1;
		this.updateZoomLabel();
		this.updateClickOpenButton();
		// Re-binding to another note invalidates the old dependency set and its build folder.
		if (this.filePath !== previousPath) {
			if (previousPath) this.cleanupFor(previousPath);
			this.watchSet = new Set(this.filePath ? [this.filePath] : []);
			this.lastAnchor = null;
			this.destCache = null;
			this.anchorIndex = null;
		}
		this.refreshBody();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('nope-preview-content');

		const toolbar = this.contentEl.createDiv({ cls: 'nope-preview-toolbar' });

		// Left: render + Overleaf-style dropdown for the render modes.
		this.renderButton = toolbar.createDiv({ cls: 'clickable-icon nope-preview-action' });
		setIcon(this.renderButton, 'refresh-cw');
		this.renderButton.setAttribute('aria-label', 'Render now');
		this.renderButton.addEventListener('click', () => this.requestRender());

		const caret = toolbar.createDiv({ cls: 'clickable-icon nope-preview-action' });
		setIcon(caret, 'chevron-down');
		caret.setAttribute('aria-label', 'Render options');
		caret.addEventListener('click', (evt) => this.openRenderMenu(evt));

		// One-shot editor→PDF sync: scroll to the anchor at the cursor of the last active editor.
		const syncButton = toolbar.createDiv({ cls: 'clickable-icon nope-preview-action' });
		setIcon(syncButton, 'locate');
		syncButton.setAttribute('aria-label', 'Sync PDF to editor');
		syncButton.addEventListener('click', () => this.syncFromEditor());

		// Toggle for PDF→editor sync: while active, a click in the PDF opens the note rendered there.
		this.clickOpenButton = toolbar.createDiv({ cls: 'clickable-icon nope-preview-action' });
		setIcon(this.clickOpenButton, 'mouse-pointer-click');
		this.clickOpenButton.setAttribute('aria-label', 'Click PDF to open the note at that position');
		this.clickOpenButton.addEventListener('click', () => this.toggleClickOpen());
		this.updateClickOpenButton();

		// Zoom controls; the label resets to fit-width on click.
		const zoomOut = toolbar.createDiv({ cls: 'clickable-icon nope-preview-action' });
		setIcon(zoomOut, 'zoom-out');
		zoomOut.setAttribute('aria-label', 'Zoom out');
		zoomOut.addEventListener('click', () => this.setZoom(this.zoom / 1.25));

		this.zoomLabel = toolbar.createSpan({ cls: 'nope-preview-zoom clickable-icon' });
		this.zoomLabel.setAttribute('aria-label', 'Reset zoom to fit width');
		this.zoomLabel.addEventListener('click', () => this.setZoom(1));

		const zoomIn = toolbar.createDiv({ cls: 'clickable-icon nope-preview-action' });
		setIcon(zoomIn, 'zoom-in');
		zoomIn.setAttribute('aria-label', 'Zoom in');
		zoomIn.addEventListener('click', () => this.setZoom(this.zoom * 1.25));

		// Page indicator: editable current page + total.
		this.pageInput = toolbar.createEl('input', {
			cls: 'nope-preview-page-input',
			attr: { type: 'text' },
		});
		this.pageInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') this.jumpToPageInput();
		});
		this.pageInput.addEventListener('blur', () => this.jumpToPageInput());
		this.pageTotalEl = toolbar.createSpan({ cls: 'nope-preview-page-total', text: '/ –' });

		this.statusEl = toolbar.createSpan({ cls: 'nope-preview-status' });
		this.updateZoomLabel();

		// Right: download the current PDF to a location of the user's choosing.
		const download = toolbar.createDiv({ cls: 'clickable-icon nope-preview-action nope-preview-right' });
		setIcon(download, 'download');
		download.setAttribute('aria-label', 'Save PDF as…');
		download.addEventListener('click', () => void this.downloadPdf());

		this.bodyEl = this.contentEl.createDiv({ cls: 'nope-preview-body' });
		this.refreshBody();

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!this.autoRender || !(file instanceof TFile)) return;
				if (!this.watchSet.has(file.path)) return;
				this.debouncedRender();
			}),
		);
		// Scroll fires on the inner page container; capture phase catches it on contentEl.
		this.registerDomEvent(this.contentEl, 'scroll', () => this.schedulePageUpdate(), true);
		// Capture phase so click-to-open wins over the link annotation layer while active.
		this.registerDomEvent(this.bodyEl, 'click', (evt) => void this.handlePdfClick(evt), true);
		// Mod+click inside an editor syncs the preview to the clicked position (setting-gated).
		this.registerDomEvent(activeDocument, 'click', (evt) => this.handleEditorModClick(evt));
		// Remember the last markdown leaf so sync and click-to-open never target the preview itself.
		const seed = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (seed) this.lastEditorLeaf = seed.leaf;
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf && leaf !== this.leaf && leaf.view instanceof MarkdownView) {
					this.lastEditorLeaf = leaf;
				}
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
		void this.destroyDoc();
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

	// Absolute path of the build PDF inside the plugin dir.
	private pdfPath(file: TFile): string {
		const base = file.basename;
		return join(getPluginAbsoluteDir(this.plugin), 'pipeline', 'build', base, `${base}.pdf`);
	}

	private setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
		if (!this.statusEl) return;
		this.statusEl.setText(message);
		this.statusEl.toggleClass('nope-preview-status-error', kind === 'error');
	}

	private refreshBody(destination?: string): void {
		if (!this.bodyEl) return;
		const file = this.getFile();
		if (!file) {
			this.showPlaceholder('No note bound — run "Open PDF preview" from a note.');
			return;
		}
		const abs = this.pdfPath(file);
		if (!existsSync(abs)) {
			this.showPlaceholder(`No PDF yet for "${file.basename}" — click "Render now".`);
			return;
		}
		// Page container persists across jumps so we don't re-parse the PDF on every scroll.
		if (!this.pagesEl || !this.bodyEl.contains(this.pagesEl)) {
			this.bodyEl.empty();
			this.pagesEl = this.bodyEl.createDiv({ cls: 'nope-preview-pages' });
			this.loadedKey = null;
		}
		// Reload only when the PDF actually changed (mtime); otherwise just scroll.
		const key = `${abs}:${statSync(abs).mtimeMs}`;
		if (key !== this.loadedKey) {
			this.loadedKey = key;
			void this.renderPdf(abs, destination);
		} else if (destination) {
			void this.scrollToDest(destination);
		}
	}

	private showPlaceholder(text: string): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();
		this.pagesEl = null;
		this.loadedKey = null;
		this.numPages = 0;
		this.updatePageIndicator();
		void this.destroyDoc();
		this.bodyEl.createDiv({ cls: 'nope-preview-empty', text });
	}

	private async destroyDoc(): Promise<void> {
		const doc = this.pdfDoc;
		this.pdfDoc = null;
		if (doc) {
			try {
				await doc.destroy();
			} catch {
				// Ignore teardown errors.
			}
		}
	}

	// Render every page: canvas (image) + text layer (selection) + link layer (hyperlinks).
	private async renderPdf(abs: string, destination?: string): Promise<void> {
		const container = this.pagesEl;
		if (!container) return;
		const token = ++this.renderToken;
		this.clearErrorBanner();
		try {
			await this.destroyDoc();
			const data = new Uint8Array(readFileSync(abs));
			const doc = await pdfjsLib.getDocument({ data }).promise;
			if (token !== this.renderToken) {
				await doc.destroy();
				return;
			}
			this.pdfDoc = doc;
			// Page refs in the anchor index belong to the previous document proxy.
			this.anchorIndex = null;
			this.numPages = doc.numPages;
			container.empty();
			const width = Math.max((container.clientWidth - 16) * this.zoom, 200);
			// Render at device pixel ratio so it stays crisp on HiDPI / Windows display scaling.
			const outputScale = Math.min(activeWindow.devicePixelRatio || 1, 3);
			for (let i = 1; i <= doc.numPages; i++) {
				if (token !== this.renderToken) return;
				const page = await doc.getPage(i);
				const base = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({ scale: width / base.width });

				const wrap = container.createDiv({ cls: 'nope-preview-page-wrap' });
				const canvas = wrap.createEl('canvas', { cls: 'nope-preview-page' });
				// Backing store scaled up; CSS size stays logical so the overlays line up.
				canvas.width = Math.floor(viewport.width * outputScale);
				canvas.height = Math.floor(viewport.height * outputScale);
				canvas.style.width = `${Math.floor(viewport.width)}px`;
				canvas.style.height = `${Math.floor(viewport.height)}px`;
				const ctx = canvas.getContext('2d');
				if (!ctx) continue;
				const transform = outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0];
				await page.render({ canvasContext: ctx, viewport, transform }).promise;
				if (token !== this.renderToken) return;

				// Selectable text overlay.
				const textLayer = wrap.createDiv({ cls: 'textLayer' });
				textLayer.style.setProperty('--scale-factor', String(viewport.scale));
				await new pdfjsLib.TextLayer({
					textContentSource: await page.getTextContent(),
					container: textLayer,
					viewport,
				}).render();
				if (token !== this.renderToken) return;

				await this.buildLinkLayer(wrap, page, viewport);
			}
			this.updatePageIndicator();
			if (destination) await this.scrollToDest(destination);
			// Restore the page the user was on before a zoom re-render.
			if (this.scrollToPageAfterRender !== null) {
				this.scrollToPage(this.scrollToPageAfterRender);
				this.scrollToPageAfterRender = null;
			}
		} catch {
			// A newer render (e.g. from zoom) tears down this one's doc mid-flight, which
			// rejects the pending tasks — only surface an error if we're still the current render.
			if (token === this.renderToken) this.showErrorBanner('Could not render the PDF.');
		}
	}

	// Clickable link overlay: external links open, internal links scroll the preview.
	private async buildLinkLayer(wrap: HTMLElement, page: PDFPageProxy, viewport: PageViewport): Promise<void> {
		const annotations = await page.getAnnotations();
		if (!Array.isArray(annotations) || annotations.length === 0) return;
		const layer = wrap.createDiv({ cls: 'nope-preview-annotations' });
		for (const raw of annotations) {
			const a = raw as { subtype?: string; rect?: number[]; url?: string; dest?: unknown };
			if (a.subtype !== 'Link' || !Array.isArray(a.rect)) continue;
			const r = viewport.convertToViewportRectangle(a.rect) as number[];
			const x1 = r[0] ?? 0;
			const y1 = r[1] ?? 0;
			const x2 = r[2] ?? 0;
			const y2 = r[3] ?? 0;
			const link = layer.createEl('a', { cls: 'nope-preview-link' });
			link.style.left = `${Math.min(x1, x2)}px`;
			link.style.top = `${Math.min(y1, y2)}px`;
			link.style.width = `${Math.abs(x2 - x1)}px`;
			link.style.height = `${Math.abs(y2 - y1)}px`;
			if (typeof a.url === 'string' && a.url !== '') {
				link.href = a.url;
				link.setAttribute('target', '_blank');
				link.setAttribute('rel', 'noopener');
			} else if (a.dest !== undefined && a.dest !== null) {
				const dest = a.dest;
				link.addEventListener('click', (e) => {
					e.preventDefault();
					if (typeof dest === 'string') void this.scrollToDest(dest);
					else if (Array.isArray(dest)) void this.scrollToResolvedDest(dest);
				});
			}
		}
	}

	// Resolve a named destination, then scroll to its page + vertical position.
	private async scrollToDest(name: string): Promise<void> {
		const doc = this.pdfDoc;
		if (!doc) return;
		try {
			const dest = await doc.getDestination(name);
			if (Array.isArray(dest)) await this.scrollToResolvedDest(dest);
		} catch {
			// Destination not found — leave the view where it is.
		}
	}

	// Scroll to an explicit destination array ([pageRef, fitType, …coords]).
	private async scrollToResolvedDest(dest: unknown[]): Promise<void> {
		const doc = this.pdfDoc;
		const container = this.pagesEl;
		if (!doc || !container || dest.length === 0) return;
		try {
			const ref = dest[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0];
			const pageIndex = await doc.getPageIndex(ref);
			const wrap = container.children.item(pageIndex);
			if (!(wrap instanceof HTMLElement)) return;
			const canvas = wrap.querySelector('canvas');
			const top = destTop(dest);
			if (top === null || !(canvas instanceof HTMLCanvasElement)) {
				wrap.scrollIntoView({ block: 'start' });
				return;
			}
			// Map the PDF y-coordinate to a pixel offset using this canvas's actual scale.
			const page = await doc.getPage(pageIndex + 1);
			const scale = canvas.height / page.getViewport({ scale: 1 }).height;
			const point = page.getViewport({ scale }).convertToViewportPoint(0, top) as number[];
			const vy = point[1] ?? 0;
			const displayScale = canvas.clientHeight / canvas.height || 1;
			const delta =
				wrap.getBoundingClientRect().top -
				container.getBoundingClientRect().top +
				vy * displayScale;
			container.scrollTop += delta - 8;
		} catch {
			// Page/destination unavailable — leave the view where it is.
		}
	}

	// Parse the .aux once per render; invalidated on render success and re-bind.
	private getDestinations(file: TFile): Map<string, string> {
		if (!this.destCache) {
			const base = file.basename;
			const auxPath = join(getPluginAbsoluteDir(this.plugin), 'pipeline', 'build', base, `${base}.aux`);
			this.destCache = parseAuxDestinations(auxPath);
		}
		return this.destCache;
	}

	private resolveAnchor(file: TFile, candidates: string[]): { candidate: string; dest: string } | null {
		const destinations = this.getDestinations(file);
		for (const candidate of candidates) {
			const dest = destinations.get(candidate);
			if (dest) return { candidate, dest };
		}
		return null;
	}

	// Manual editor→PDF sync: loud feedback on every outcome.
	private syncToAnchor(candidates: string[]): void {
		const file = this.getFile();
		if (!file) {
			this.setStatus('No note bound to this preview.', 'error');
			return;
		}
		if (this.getDestinations(file).size === 0) {
			this.setStatus('No anchors available — render first.', 'error');
			return;
		}
		const hit = this.resolveAnchor(file, candidates);
		if (!hit) {
			this.setStatus('No matching anchor for the cursor position.', 'error');
			return;
		}
		this.lastAnchor = hit;
		this.refreshBody(hit.dest);
		this.setStatus(`Jumped to ${hit.candidate}`);
	}

	// The tracked editor leaf, only while it still lives in the layout and shows markdown.
	private lastEditorView(): MarkdownView | null {
		const leaf = this.lastEditorLeaf;
		if (!leaf || !this.isLeafAttached(leaf)) return null;
		return leaf.view instanceof MarkdownView ? leaf.view : null;
	}

	private isLeafAttached(leaf: WorkspaceLeaf): boolean {
		let attached = false;
		this.app.workspace.iterateAllLeaves((l) => {
			if (l === leaf) attached = true;
		});
		return attached;
	}

	// Toolbar button: one-shot scroll to the cursor anchor of the last active editor.
	private syncFromEditor(): void {
		const view = this.lastEditorView();
		const file = view?.file;
		if (!view || !file) {
			this.setStatus('No recent editor to sync from.', 'error');
			return;
		}
		this.syncToAnchor(cursorAnchorCandidates(this.app, view.editor, file));
	}

	// Public: also driven by the "Toggle click-to-open in PDF preview" command.
	toggleClickOpen(): void {
		this.clickOpen = !this.clickOpen;
		this.updateClickOpenButton();
		this.app.workspace.requestSaveLayout();
		this.setStatus(
			this.clickOpen ? 'Click the PDF to open the note rendered there.' : 'Click-to-open off.',
		);
	}

	// Editor half of "Follow on Ctrl/Cmd+click": the clicked note must be part of the document.
	private handleEditorModClick(evt: MouseEvent): void {
		if (!this.plugin.settings.followOnModClick || !Keymap.isModifier(evt, 'Mod')) return;
		const target = evt.target;
		if (!(target instanceof HTMLElement)) return;
		// The PDF half lives in handlePdfClick; links keep Obsidian's mod-click navigation.
		if (this.contentEl.contains(target)) return;
		if (target.closest('a, .cm-hmd-internal-link, .cm-link, .cm-url, .cm-underline')) return;
		if (!target.closest('.cm-editor')) return;
		// The clicked leaf became active on mousedown, so the tracked editor is the right one.
		const view = this.lastEditorView();
		const file = view?.file;
		if (!view || !file || !view.containerEl.contains(target)) return;
		const bound = this.getFile();
		if (!bound || !this.candidateNotes(bound).some((f) => f.path === file.path)) return;
		this.syncToAnchor(cursorAnchorCandidates(this.app, view.editor, file));
	}

	private updateClickOpenButton(): void {
		this.clickOpenButton?.toggleClass('is-active', this.clickOpen);
		this.contentEl.toggleClass('nope-preview-clickopen', this.clickOpen);
	}

	// Click in the PDF → nearest anchor above the click → open the matching note in the editor.
	// Active via the toolbar toggle, or per click via mod+click when the setting is on.
	private async handlePdfClick(evt: MouseEvent): Promise<void> {
		const modFollow = this.plugin.settings.followOnModClick && Keymap.isModifier(evt, 'Mod');
		if ((!this.clickOpen && !modFollow) || this.rendering) return;
		const target = evt.target;
		if (!(target instanceof HTMLElement) || target.closest('.nope-preview-banner')) return;
		const wrap = target.closest('.nope-preview-page-wrap');
		const container = this.pagesEl;
		const doc = this.pdfDoc;
		const file = this.getFile();
		if (!(wrap instanceof HTMLElement) || !container || !doc || !file) return;
		// Don't hijack an in-progress text selection.
		const sel = activeWindow.getSelection();
		if (sel && !sel.isCollapsed) return;
		// While the mode is active it wins over the link annotation layer (capture phase).
		evt.preventDefault();
		evt.stopPropagation();
		const pageIndex = Array.from(container.children).indexOf(wrap);
		const canvas = wrap.querySelector('canvas');
		if (pageIndex < 0 || !(canvas instanceof HTMLCanvasElement) || canvas.clientHeight === 0) return;
		try {
			const page = await doc.getPage(pageIndex + 1);
			const baseHeight = page.getViewport({ scale: 1 }).height;
			const fraction = (evt.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight;
			const top = baseHeight * (1 - fraction);
			// Nearest mappable anchor wins; anchors we can't map to a note (e.g. images) are skipped.
			for (const name of await this.anchorsAbove(pageIndex, top)) {
				const hit = this.mapAnchor(name, file);
				if (hit) {
					await this.openTarget(hit, name);
					return;
				}
			}
			// Title page, TOC and friends carry no mappable anchor → the bound note itself.
			await this.openTarget({ file }, file.basename);
		} catch {
			this.setStatus('Could not resolve the clicked position.', 'error');
		}
	}

	// All anchor names at or above the click position, nearest first.
	private async anchorsAbove(pageIndex: number, top: number): Promise<string[]> {
		const index = await this.getAnchorIndex();
		const posOf = (a: AnchorPos): number => a.top ?? Number.MAX_SAFE_INTEGER;
		return index
			.filter((a) => a.page < pageIndex || (a.page === pageIndex && posOf(a) >= top - 4))
			.map((a) => a.name)
			.reverse();
	}

	// Resolve every .aux destination to its physical position once per rendered PDF.
	private async getAnchorIndex(): Promise<AnchorPos[]> {
		if (this.anchorIndex) return this.anchorIndex;
		const doc = this.pdfDoc;
		const file = this.getFile();
		const index: AnchorPos[] = [];
		if (doc && file) {
			for (const [name, destName] of this.getDestinations(file)) {
				try {
					const dest = await doc.getDestination(destName);
					if (!Array.isArray(dest) || dest.length === 0) continue;
					const ref = dest[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0];
					index.push({ page: await doc.getPageIndex(ref), top: destTop(dest), name });
				} catch {
					// Skip destinations the document no longer knows.
				}
			}
			// Reading order: page ascending, then top of page (large y) first.
			const posOf = (a: AnchorPos): number => a.top ?? Number.MAX_SAFE_INTEGER;
			index.sort((a, b) => a.page - b.page || posOf(b) - posOf(a));
		}
		this.anchorIndex = index;
		return index;
	}

	// Map a label/anchor name back to a vault note (and line where possible).
	private mapAnchor(name: string, mainFile: TFile): { file: TFile; line?: number } | null {
		const m = name.match(/^(?:note|tab|eq|fig):([^:]+)(?::(sec|blk)-(.+))?$/);
		// No filter prefix → a pandoc heading slug from the merged document.
		if (!m) return this.headingBySlug(name, mainFile);
		const file = this.fileForLabelBase(m[1] ?? '', mainFile);
		if (!file) return null;
		const kind = m[2];
		const rest = m[3];
		if (kind === 'sec' && rest !== undefined) {
			const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
			const h = headings.find((x) => sanitizeLabelId(x.heading) === rest);
			return { file, line: h?.position.start.line };
		}
		if (kind === 'blk' && rest !== undefined) {
			const block = this.app.metadataCache.getFileCache(file)?.blocks?.[rest];
			return { file, line: block?.position.start.line };
		}
		return { file };
	}

	// The bound note plus everything it pulls in. Sources: the metadata embed/link graph
	// (available before the first render) and the markdown deps of the last render
	// (covers indirections the cache can't see, e.g. nesting behind passive embeds).
	private candidateNotes(mainFile: TFile): TFile[] {
		const out: TFile[] = [];
		const seen = new Set<string>();
		const add = (f: TFile): void => {
			if (seen.has(f.path)) return;
			seen.add(f.path);
			out.push(f);
		};
		add(mainFile);
		const queue: TFile[] = [mainFile];
		for (let i = 0; i < queue.length; i++) {
			const current = queue[i];
			if (!current) continue;
			const cache = this.app.metadataCache.getFileCache(current);
			const resolve = (link: string): TFile | null => {
				const linkpath = link.split('#')[0] ?? '';
				if (linkpath === '') return null;
				const t = this.app.metadataCache.getFirstLinkpathDest(linkpath, current.path);
				return t && t.extension.toLowerCase() === 'md' ? t : null;
			};
			// Embeds transclude → recurse; plain links (incl. passive embeds) only collect.
			for (const embed of cache?.embeds ?? []) {
				const t = resolve(embed.link);
				if (t && !seen.has(t.path)) {
					add(t);
					queue.push(t);
				}
			}
			for (const link of cache?.links ?? []) {
				const t = resolve(link.link);
				if (t) add(t);
			}
		}

		for (const path of this.watchSet) {
			if (!path.toLowerCase().endsWith('.md')) continue;
			const f = this.app.vault.getFileByPath(path);
			if (f) add(f);
		}
		return out;
	}

	// Label bases come from the wikilink target as written — usually the basename, but a
	// subpath link ("folder/note") sanitizes its slashes too, hence the path-suffix check.
	private fileForLabelBase(base: string, mainFile: TFile): TFile | null {
		for (const f of this.candidateNotes(mainFile)) {
			if (sanitizeLabelId(f.basename) === base) return f;
			const sanitizedPath = sanitizeLabelId(f.path.replace(/\.md$/i, ''));
			if (sanitizedPath === base || sanitizedPath.endsWith(`_${base}`)) return f;
		}
		return null;
	}

	// Find the heading behind a pandoc slug, main note first; retry without pandoc's -N dedup suffix.
	private headingBySlug(slug: string, mainFile: TFile): { file: TFile; line: number } | null {
		const stripped = slug.replace(/-\d+$/, '');
		for (const file of this.candidateNotes(mainFile)) {
			const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
			for (const h of headings) {
				const id = pandocAutoIdentifier(h.heading);
				if (id === slug || (stripped !== slug && id === stripped)) {
					return { file, line: h.position.start.line };
				}
			}
		}
		return null;
	}

	// Open in the last active editor leaf; never in the preview leaf itself.
	private async openTarget(target: { file: TFile; line?: number }, label: string): Promise<void> {
		let leaf = this.lastEditorLeaf;
		if (!leaf || leaf === this.leaf || !this.isLeafAttached(leaf)) {
			leaf = this.app.workspace.getLeaf('tab');
		}
		await leaf.openFile(target.file, {
			active: true,
			...(target.line !== undefined ? { eState: { line: target.line } } : {}),
		});
		this.lastEditorLeaf = leaf;
		this.setStatus(`Opened ${label}`);
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
		// Jump straight to the LaTeX logs in the build folder for debugging.
		const buildFolder = this.buildFolderPath();
		if (existsSync(buildFolder)) {
			const btn = banner.createEl('button', {
				cls: 'nope-preview-banner-button',
				text: 'Open build folder',
			});
			btn.addEventListener('click', (evt) => {
				// Keep the banner open — only the dismiss-on-click of the banner itself should close it.
				evt.stopPropagation();
				void shell.openPath(buildFolder);
			});
		}
		banner.setAttribute('aria-label', 'Click to dismiss');
		banner.addEventListener('click', () => banner.remove());
		this.bodyEl.prepend(banner);
	}

	// pipeline/build holds the fixed-path error logs (last_latex_run.log, last-build.log)
	// alongside the per-doc subfolders — open it, not the per-doc folder, for debugging.
	private buildFolderPath(): string {
		return join(getPluginAbsoluteDir(this.plugin), 'pipeline', 'build');
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

	// Overleaf-style dropdown: render modes as checkable menu items.
	private openRenderMenu(evt: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle('Auto-render')
				.setChecked(this.autoRender)
				.onClick(() => {
					this.autoRender = !this.autoRender;
					this.app.workspace.requestSaveLayout();
					// Persist so the choice survives closing and reopening the preview.
					this.plugin.settings.previewAutoRender = this.autoRender;
					void this.plugin.saveSettings();
					// Render on enable so the watch set reflects the current document.
					if (this.autoRender) this.requestRender();
				}),
		);
		menu.showAtMouseEvent(evt);
	}

	// Save the current build PDF to a user-chosen location (outside the vault by default).
	private async downloadPdf(): Promise<void> {
		const file = this.getFile();
		if (!file) {
			new Notice('No note bound to this preview.');
			return;
		}
		const abs = this.pdfPath(file);
		if (!existsSync(abs)) {
			new Notice('No PDF yet — render first.');
			return;
		}
		try {
			const result = await remote.dialog.showSaveDialog({
				title: 'Save PDF',
				defaultPath: `${file.basename}.pdf`,
				filters: [{ name: 'PDF', extensions: ['pdf'] }],
			});
			if (result.canceled || !result.filePath) return;
			copyFileSync(abs, result.filePath);
			new Notice(`Saved PDF to ${result.filePath}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not save PDF: ${msg}`, 10000);
		}
	}

	private updateZoomLabel(): void {
		this.zoomLabel?.setText(`${Math.round(this.zoom * 100)}%`);
	}

	// Zoom = multiplier on the fit-width scale; re-render and keep the current page.
	private setZoom(value: number): void {
		const clamped = Math.min(Math.max(value, 0.25), 5);
		if (Math.abs(clamped - this.zoom) < 0.001) return;
		this.zoom = clamped;
		this.updateZoomLabel();
		this.app.workspace.requestSaveLayout();
		this.scrollToPageAfterRender = this.currentVisiblePage();
		this.loadedKey = null;
		this.refreshBody();
	}

	// rAF-throttle the (per-page) scroll computation.
	private schedulePageUpdate(): void {
		if (this.pageTick) return;
		this.pageTick = true;
		window.requestAnimationFrame(() => {
			this.pageTick = false;
			this.updatePageIndicator();
		});
	}

	private updatePageIndicator(): void {
		if (!this.pageInput || !this.pageTotalEl) return;
		this.pageTotalEl.setText(this.numPages ? `/ ${this.numPages}` : '/ –');
		if (this.numPages === 0) {
			this.pageInput.value = '';
			return;
		}
		// Don't fight the user while they're typing a page number.
		if (this.pageInput !== this.pageInput.ownerDocument.activeElement) {
			this.pageInput.value = String(this.currentVisiblePage());
		}
	}

	// The page whose box crosses the vertical center of the viewport.
	private currentVisiblePage(): number {
		const c = this.pagesEl;
		if (!c || c.children.length === 0) return 1;
		const mid = c.getBoundingClientRect().top + c.clientHeight / 2;
		for (let i = 0; i < c.children.length; i++) {
			const w = c.children.item(i);
			if (w instanceof HTMLElement && w.getBoundingClientRect().bottom >= mid) return i + 1;
		}
		return c.children.length;
	}

	private jumpToPageInput(): void {
		if (!this.pageInput) return;
		const n = parseInt(this.pageInput.value, 10);
		if (!Number.isFinite(n)) {
			this.updatePageIndicator();
			return;
		}
		this.scrollToPage(n);
	}

	private scrollToPage(n: number): void {
		const c = this.pagesEl;
		if (!c || c.children.length === 0) return;
		const clamped = Math.min(Math.max(n, 1), c.children.length);
		const w = c.children.item(clamped - 1);
		if (w instanceof HTMLElement) w.scrollIntoView({ block: 'start' });
	}

	// Public trigger so the open command can fire a render as if "Render now" was clicked.
	triggerRender(): void {
		this.requestRender();
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
		this.renderButton?.toggleClass('nope-preview-busy', true);
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
				// New PDF, new .aux: drop caches, then re-anchor in the SAME reload (no flash of page 1).
				// Re-resolve by candidate, not by destination — counter names shift between renders.
				const previousAnchor = this.lastAnchor;
				this.destCache = null;
				this.anchorIndex = null;
				this.lastAnchor = null;
				const hit = previousAnchor ? this.resolveAnchor(file, [previousAnchor.candidate]) : null;
				this.lastAnchor = hit;
				this.refreshBody(hit?.dest);
			} else {
				this.showErrorBanner('Render failed — showing the last successful PDF.');
			}
		} finally {
			this.rendering = false;
			this.renderButton?.toggleClass('nope-preview-busy', false);
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
				// Fall back to the persisted settings when no preview is open (state is otherwise lost on close).
				state: {
					filePath: targetPath,
					autoRender: existingView?.getState().autoRender ?? plugin.settings.previewAutoRender,
					clickOpen: existingView?.getState().clickOpen ?? false,
				},
			});
			await plugin.app.workspace.revealLeaf(leaf);

			// Kick off a render immediately, as if "Render now" was clicked.
			const view = leaf.view instanceof NopePreviewView ? leaf.view : null;
			view?.triggerRender();
		},
	});
}

export function registerPreviewClickOpenToggleCommand(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'toggle-preview-click-open',
		name: 'Toggle click-to-open in PDF preview',
		checkCallback: (checking) => {
			const leaf = plugin.app.workspace.getLeavesOfType(NOPE_PREVIEW_VIEW_TYPE)[0];
			const view = leaf?.view instanceof NopePreviewView ? leaf.view : null;
			if (!view) return false;
			if (!checking) view.toggleClickOpen();
			return true;
		},
	});
}

