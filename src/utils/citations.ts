// Citation-note bridge — generate a BibTeX file from notes that carry a citekey.

import { App, TFile } from 'obsidian';
import { writeFileSync } from 'fs';
import { join } from 'path';

export const CITEKEY_KEY = 'citekey';

// Frontmatter key → BibTeX field. Keys not listed are ignored.
const FIELD_MAP: Record<string, string> = {
	author: 'author',
	editor: 'editor',
	title: 'title',
	year: 'year',
	month: 'month',
	journal: 'journal',
	booktitle: 'booktitle',
	publisher: 'publisher',
	institution: 'institution',
	school: 'school',
	organization: 'organization',
	volume: 'volume',
	number: 'number',
	pages: 'pages',
	series: 'series',
	chapter: 'chapter',
	edition: 'edition',
	address: 'address',
	doi: 'doi',
	url: 'url',
	isbn: 'isbn',
	issn: 'issn',
	howpublished: 'howpublished',
	note: 'note',
	keywords: 'keywords',
	abstract: 'abstract',
};

// BibTeX entry type comes from `bibtype`/`entry-type`; default to misc.
const TYPE_KEYS = ['bibtype', 'entry-type'];

// Walk the embed + link graph from the export file, collect every citation note
export function prepareCitations(app: App, file: TFile, workDir: string): string[] {
	const visited = new Set<string>();
	const queue: TFile[] = [file];
	const entries = new Map<string, string>(); // citekey → BibTeX entry
	const deps = new Set<string>();

	while (queue.length > 0) {
		const note = queue.shift();
		if (!note || visited.has(note.path)) continue;
		visited.add(note.path);

		const cache = app.metadataCache.getFileCache(note);
		if (!cache) continue;

		// Any link or embed in this note may point at a citation source.
		const refs = [...(cache.links ?? []), ...(cache.embeds ?? [])];
		for (const ref of refs) {
			const dest = resolveLink(app, ref.link, note.path);
			if (!dest) continue;
			const fm = app.metadataCache.getFileCache(dest)?.frontmatter;
			if (!fm) continue;
			const rawKey: unknown = fm[CITEKEY_KEY];
			if (typeof rawKey !== 'string' || rawKey.trim() === '') continue;
			const key = rawKey.trim();
			if (!entries.has(key)) {
				entries.set(key, buildBibtexEntry(key, fm));
				deps.add(dest.path);
			}
		}

		// Recurse into transcluded md notes — their wikilinks are resolved too.
		for (const e of cache.embeds ?? []) {
			const dest = resolveLink(app, e.link, note.path);
			if (dest && dest.extension === 'md') queue.push(dest);
		}
	}

	if (entries.size === 0) return [];
	writeFileSync(join(workDir, 'references-notes.bib'), [...entries.values()].join('\n\n') + '\n', 'utf8');
	return [...deps];
}

// Resolve a wikilink/embed link (minus any #subpath) to an md TFile, or null.
function resolveLink(app: App, link: string, sourcePath: string): TFile | null {
	const hash = link.indexOf('#');
	const linkpath = hash >= 0 ? link.slice(0, hash) : link;
	if (linkpath === '') return null;
	const dest = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	return dest && dest.extension === 'md' ? dest : null;
}

function buildBibtexEntry(key: string, fm: Record<string, unknown>): string {
	let type = 'misc';
	for (const tk of TYPE_KEYS) {
		const v = fm[tk];
		if (typeof v === 'string' && v.trim() !== '') {
			type = v.trim();
			break;
		}
	}

	const fields: string[] = [];
	for (const [fmKey, bibField] of Object.entries(FIELD_MAP)) {
		const v = fm[fmKey];
		const formatted = formatValue(bibField, v);
		if (formatted !== null) fields.push(`  ${bibField} = {${formatted}}`);
	}

	return `@${type}{${key},\n${fields.join(',\n')}\n}`;
}

// Render a frontmatter value as a BibTeX field body, or null to skip it.
// author/editor lists join with " and "; other lists with ", ".
function formatValue(field: string, v: unknown): string | null {
	if (v === undefined || v === null || v === '') return null;
	const sep = field === 'author' || field === 'editor' ? ' and ' : ', ';
	const raw = Array.isArray(v)
		? v.map(scalarToString).filter((s) => s !== '').join(sep)
		: scalarToString(v);
	const cleaned = escapeBibtex(raw).trim();
	return cleaned === '' ? null : cleaned;
}

// Only scalars make sense as BibTeX field values; objects are dropped.
function scalarToString(x: unknown): string {
	if (typeof x === 'string') return x;
	if (typeof x === 'number' || typeof x === 'boolean') return String(x);
	return '';
}

// Balance stray braces so a value can't break out of its {…} wrapper.
function escapeBibtex(s: string): string {
	return s.replace(/[{}]/g, '');
}
