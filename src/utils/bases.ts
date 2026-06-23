// Bases-Embed support. A base embed ![[X.base#view]] is content; 
// the containing note's latex-env decides the wrap: `table` → rendered table, else → transclusion 

import {
	App,
	BasesEntry,
	BasesPropertyId,
	BasesView,
	Plugin,
	QueryController,
	TFile,
	parseYaml,
	stringifyYaml,
} from 'obsidian';
import { writeFileSync } from 'fs';
import { join } from 'path';

const VIEW_ID = 'nope-export';

// One base is mounted at a time, so a single capture slot suffices.
interface Capture {
	resolve: (v: NopeExportView) => void;
	settleTimer: number | null;
	hardTimer: number;
}
let capture: Capture | null = null;
let registered = false;

class NopeExportView extends BasesView {
	type = VIEW_ID;

	constructor(controller: QueryController) {
		super(controller);
	}

	onDataUpdated(): void {
		const c = capture;
		if (!c || !this.data) return;
		// Settle: each update restarts a short timer, resolve once quiet (final state).
		if (c.settleTimer !== null) window.clearTimeout(c.settleTimer);
		c.settleTimer = window.setTimeout(() => {
			window.clearTimeout(c.hardTimer);
			capture = null;
			c.resolve(this);
		}, 250);
	}
}

// Register the capturing view; no-op effect if the core Bases plugin is disabled.
export function registerBasesExportView(plugin: Plugin): void {
	registered = plugin.registerBasesView(VIEW_ID, {
		name: 'NOPE export',
		icon: 'table',
		factory: (controller: QueryController) => new NopeExportView(controller),
	});
}

function captureNextMount(timeoutMs = 8000): Promise<NopeExportView> {
	return new Promise((resolve, reject) => {
		const c: Capture = {
			resolve,
			settleTimer: null,
			hardTimer: window.setTimeout(() => {
				if (capture === c) capture = null;
				if (c.settleTimer !== null) window.clearTimeout(c.settleTimer);
				reject(new Error('Bases mount timeout — onDataUpdated never fired'));
			}, timeoutMs),
		};
		capture = c;
	});
}

// Value subclasses all carry a meaningful toString(); null → empty cell.
function valueToString(v: unknown): string {
	if (v === null || v === undefined) return '';
	return (v as { toString(): string }).toString();
}

// Pipe-table cells must not contain raw | or newlines.
function escapeCell(s: string): string {
	return s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}

interface ResolvedBase {
	headers: string[];
	rows: { file: TFile; values: string[] }[];
}

interface BaseViewCfg {
	name?: string;
	type?: string;
	[key: string]: unknown;
}

// GFM pipe table — Pandoc's `markdown` parses it into a Table node, so the existing
// wrap_table (caption, fit/longtable, label, autoref) applies unchanged.
function buildMarkdownTable(rb: ResolvedBase): string {
	const cols = rb.headers.length > 0 ? rb.headers : ['(empty)'];
	const head = `| ${cols.map(escapeCell).join(' | ')} |`;
	const sep = `| ${cols.map(() => '---').join(' | ')} |`;
	const body = rb.rows
		.map((r) => {
			const cells = r.values.length ? r.values : cols.map(() => '');
			return `| ${cells.map(escapeCell).join(' | ')} |`;
		})
		.join('\n');
	return [head, sep, body].filter((l) => l.length > 0).join('\n');
}

// Reproduce the user's view via the real engine: copy its config, retype the target
// view to ours, mount the temp base headless and read the BasesQueryResult.
async function resolveBaseView(app: App, baseFile: TFile, viewName: string | undefined): Promise<ResolvedBase> {
	const raw = await app.vault.read(baseFile);
	const cfg = (parseYaml(raw) ?? {}) as Record<string, unknown>;
	const rawViews = cfg.views;
	const views: BaseViewCfg[] = Array.isArray(rawViews) ? (rawViews as BaseViewCfg[]) : [];
	const userView = viewName ? views.find((v) => v.name === viewName) : views[0];
	if (!userView) {
		throw new Error(`Base view "${viewName ?? '(first)'}" not found in ${baseFile.path}`);
	}

	const tempCfg = { ...cfg, views: [{ ...userView, type: VIEW_ID }] };
	const tempFile = await ensureTempBase(app, stringifyYaml(tempCfg));

	// A fresh foreground leaf per base — reusing one leaf breaks the second mount
	// (onDataUpdated never fires); a backgrounded leaf is deferred and never renders.
	let leaf: ReturnType<App['workspace']['getLeaf']> | null = null;
	try {
		const captured = captureNextMount();
		leaf = app.workspace.getLeaf(true);
		await leaf.openFile(tempFile, { active: false });
		const view = await captured;

		const order: BasesPropertyId[] = view.config.getOrder();
		const headers = order.map((p) => view.config.getDisplayName(p));
		const rows = view.data.data.map((entry: BasesEntry) => ({
			file: entry.file,
			values: order.map((p) => valueToString(entry.getValue(p))),
		}));
		return { headers, rows };
	} finally {
		if (leaf) {
			try {
				leaf.detach();
			} catch {
				/* ignore */
			}
		}
		// Note: we deliberately do NOT delete the scratch base here — see TEMP_BASE_PATH.
	}
}

// Single, reused scratch base for the headless mount. 
const TEMP_BASE_PATH = '_nope-temp-base.base';

async function ensureTempBase(app: App, content: string): Promise<TFile> {
	const existing = app.vault.getAbstractFileByPath(TEMP_BASE_PATH);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, content);
		return existing;
	}
	return app.vault.create(TEMP_BASE_PATH, content);
}

// Walk the embed graph from the export file
export async function prepareBases(app: App, file: TFile, workDir: string): Promise<string[]> {
	const extraDeps = new Set<string>();
	const visited = new Set<string>();
	const queue: TFile[] = [file];

	while (queue.length > 0) {
		const note = queue.shift();
		if (!note || visited.has(note.path)) continue;
		visited.add(note.path);

		const cache = app.metadataCache.getFileCache(note);
		if (!cache) continue;

		const baseEmbeds: { start: number; end: number; baseFile: TFile; viewName?: string }[] = [];
		for (const e of cache.embeds ?? []) {
			const hashIdx = e.link.indexOf('#');
			const linkpath = hashIdx >= 0 ? e.link.slice(0, hashIdx) : e.link;
			const viewName = hashIdx >= 0 ? e.link.slice(hashIdx + 1) : undefined;
			const dest = app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
			if (!dest) continue;
			if (dest.extension === 'base') {
				baseEmbeds.push({ start: e.position.start.offset, end: e.position.end.offset, baseFile: dest, viewName });
			} else if (dest.extension === 'md') {
				queue.push(dest); // regular embed → walk for nested base embeds
			}
		}

		if (baseEmbeds.length === 0) continue;
		if (!registered) {
			throw new Error('Core "Bases" plugin is disabled — base embeds cannot be exported.');
		}

		const rawEnv: unknown = cache.frontmatter?.['latex-env'];
		const isTable = typeof rawEnv === 'string' && rawEnv.toLowerCase() === 'table';
		let text = await app.vault.read(note);

		const repls: { start: number; end: number; replacement: string }[] = [];
		for (const be of baseEmbeds) {
			const rb = await resolveBaseView(app, be.baseFile, be.viewName);
			extraDeps.add(be.baseFile.path);

			let replacement: string;
			if (isTable) {
				replacement = buildMarkdownTable(rb);
				for (const r of rb.rows) extraDeps.add(r.file.path);
			} else {
				const members = rb.rows.filter((r) => r.file.extension === 'md');
				replacement = members.map((r) => `![[${r.file.basename}]]`).join('\n\n');
				for (const r of members) {
					extraDeps.add(r.file.path);
					queue.push(r.file); // members may themselves embed bases
				}
			}
			repls.push({ start: be.start, end: be.end, replacement });
		}

		// Apply back-to-front so earlier offsets stay valid.
		repls.sort((a, b) => b.start - a.start);
		for (const r of repls) {
			text = text.slice(0, r.start) + r.replacement + text.slice(r.end);
		}

		const isTopLevel = note.path === file.path;
		const outName = isTopLevel ? `${file.basename}.src.md` : `${note.basename}.md`;
		writeFileSync(join(workDir, outName), text, 'utf8');
		extraDeps.add(note.path);
	}

	return [...extraDeps];
}
