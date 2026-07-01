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

// --- "this" context inlining 
interface ThisCtx {
	note: TFile;
	fm: Record<string, unknown> | undefined;
}

function fileLiteral(prop: string | undefined, note: TFile): string | null {
	switch (prop) {
		case 'path':
			return JSON.stringify(note.path);
		case 'name':
			return JSON.stringify(note.name);
		case 'basename':
			return JSON.stringify(note.basename);
		case 'ext':
			return JSON.stringify(note.extension);
		case 'folder': {
			const p = note.parent?.path;
			return JSON.stringify(p && p !== '/' ? p : '');
		}
		case 'link':
			return `link(${JSON.stringify(note.path)}, ${JSON.stringify(note.basename)})`;
		default:
			return null; // unsupported file property → caller emits null
	}
}

function valueLiteral(v: unknown): string {
	if (v === null || v === undefined) return 'null';
	if (typeof v === 'string') return JSON.stringify(v);
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	if (v instanceof Date) return `date(${JSON.stringify(v.toISOString().slice(0, 10))})`;
	if (Array.isArray(v)) return `[${v.map(valueLiteral).join(', ')}]`;
	return 'null'; // nested objects / other types have no Bases scalar literal → null
}

// Resolve a parsed `this`-chain (e.g. ['file','link'] or ['status']) to a literal.
function resolveThisChain(chain: string[], ctx: ThisCtx): string {
	// bare `this` and bare `this.file` → host File object, so file.hasLink(this) works headless
	if (chain.length === 0) return `file(${JSON.stringify(ctx.note.path)})`;
	if (chain[0] === 'file') {
		if (chain.length === 1) return `file(${JSON.stringify(ctx.note.path)})`;
		return fileLiteral(chain[1], ctx.note) ?? 'null';
	}
	let v: unknown = ctx.fm;
	for (const key of chain) {
		if (v == null || typeof v !== 'object') {
			v = undefined;
			break;
		}
		v = (v as Record<string, unknown>)[key];
	}
	return valueLiteral(v);
}

const IDENT = /[A-Za-z0-9_$]/;

// Replace every `this`-expression in a single formula/filter string with a literal.
// String literals in the expression are skipped, so `x == "this.y"` is left intact.
function inlineThisExpr(expr: string, ctx: ThisCtx): string {
	const at = (k: number): string => expr.charAt(k); // '' when out of range → never undefined
	let out = '';
	let i = 0;
	const n = expr.length;
	while (i < n) {
		const c = at(i);
		if (c === '"' || c === "'") {
			out += c;
			i++;
			while (i < n) {
				out += at(i);
				if (at(i) === '\\' && i + 1 < n) {
					out += at(i + 1);
					i += 2;
					continue;
				}
				if (at(i) === c) {
					i++;
					break;
				}
				i++;
			}
			continue;
		}
		const prevOk = i === 0 || !IDENT.test(at(i - 1));
		const nextOk = i + 4 >= n || !IDENT.test(at(i + 4));
		if (c === 't' && expr.startsWith('this', i) && prevOk && nextOk) {
			i += 4;
			const chain: string[] = [];
			for (;;) {
				let j = i;
				while (j < n && /\s/.test(at(j))) j++;
				if (at(j) === '.') {
					j++;
					while (j < n && /\s/.test(at(j))) j++;
					let id = '';
					while (j < n && IDENT.test(at(j))) {
						id += at(j);
						j++;
					}
					if (id === '') break;
					chain.push(id);
					i = j;
				} else if (at(j) === '[') {
					j++;
					while (j < n && /\s/.test(at(j))) j++;
					const q = at(j);
					if (q !== '"' && q !== "'") break; // only quoted string keys supported
					j++;
					let key = '';
					while (j < n && at(j) !== q) {
						if (at(j) === '\\' && j + 1 < n) {
							key += at(j + 1);
							j += 2;
							continue;
						}
						key += at(j);
						j++;
					}
					j++; // closing quote
					while (j < n && /\s/.test(at(j))) j++;
					if (at(j) !== ']') break;
					j++;
					chain.push(key);
					i = j;
				} else {
					break;
				}
			}
			out += resolveThisChain(chain, ctx);
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

type FilterCfg = string | { and: FilterCfg[] } | { or: FilterCfg[] } | { not: FilterCfg[] };

function inlineThisInFilter(f: FilterCfg, ctx: ThisCtx): FilterCfg {
	if (typeof f === 'string') return inlineThisExpr(f, ctx);
	if (f && typeof f === 'object') {
		const o = f as { and?: FilterCfg[]; or?: FilterCfg[]; not?: FilterCfg[] };
		if (Array.isArray(o.and)) return { and: o.and.map((x) => inlineThisInFilter(x, ctx)) };
		if (Array.isArray(o.or)) return { or: o.or.map((x) => inlineThisInFilter(x, ctx)) };
		if (Array.isArray(o.not)) return { not: o.not.map((x) => inlineThisInFilter(x, ctx)) };
	}
	return f;
}

// Inline `this` in every string value of a name→formula map (formulas, summaries).
function inlineThisInFormulas(obj: unknown, ctx: ThisCtx): unknown {
	if (!obj || typeof obj !== 'object') return obj;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		out[k] = typeof v === 'string' ? inlineThisExpr(v, ctx) : v;
	}
	return out;
}

// Freeze the host-note context into a parsed base config (filters, formulas and
// summaries — both top-level and per view). The result contains no `this`.
function inlineThisContext(cfg: Record<string, unknown>, ctx: ThisCtx): Record<string, unknown> {
	const out: Record<string, unknown> = { ...cfg };
	if (out.filters !== undefined) out.filters = inlineThisInFilter(out.filters as FilterCfg, ctx);
	if (out.formulas) out.formulas = inlineThisInFormulas(out.formulas, ctx);
	if (out.summaries) out.summaries = inlineThisInFormulas(out.summaries, ctx);
	if (Array.isArray(out.views)) {
		out.views = (out.views as Record<string, unknown>[]).map((v) => {
			const vv: Record<string, unknown> = { ...v };
			if (vv.filters !== undefined) vv.filters = inlineThisInFilter(vv.filters as FilterCfg, ctx);
			if (vv.summaries) vv.summaries = inlineThisInFormulas(vv.summaries, ctx);
			return vv;
		});
	}
	return out;
}

// Reproduce the user's view via the real engine
async function resolveBaseView(
	app: App,
	baseFile: TFile,
	viewName: string | undefined,
	contextNote?: TFile,
	contextFm?: Record<string, unknown>,
): Promise<ResolvedBase> {
	const raw = await app.vault.read(baseFile);
	const parsed = (parseYaml(raw) ?? {}) as Record<string, unknown>;
	const cfg = contextNote ? inlineThisContext(parsed, { note: contextNote, fm: contextFm }) : parsed;
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
		// we do NOT delete the scratch base here
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
			const rb = await resolveBaseView(
				app,
				be.baseFile,
				be.viewName,
				note,
				cache.frontmatter,
			);
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
