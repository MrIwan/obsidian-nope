// Custom LaTeX template resolver

import { App, TFile } from 'obsidian';
import { copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

export const TEMPLATE_DOC_KEY = 'nope-template';
const BRANDING_DOC_KEY = 'nope-branding';
const SINGLE_WIKILINK_REGEX = /^\s*\[\[([^\]]+)\]\]\s*$/;

export interface PreparedTemplate {
	/** Basename of the resolved custom template (for notices), or null when using Eisvogel. */
	name: string | null;
	/** True when the custom template lacks the NOPE-IMPORTS block (NOPE features will break). */
	missingPreamble: boolean;
}

// Accept a plain linkpath or a wikilink; strip brackets, alias and hash.
function stripWikilink(s: string): string {
	const m = SINGLE_WIKILINK_REGEX.exec(s);
	if (m && m[1]) {
		let inner = m[1];
		const pipe = inner.indexOf('|');
		if (pipe >= 0) inner = inner.slice(0, pipe);
		const hash = inner.indexOf('#');
		if (hash >= 0) inner = inner.slice(0, hash);
		return inner.trim();
	}
	return s.trim();
}

// Read `template:` from the doc frontmatter, falling back to the branding note.
function readTemplateRef(app: App, exportFile: TFile): string | null {
	const docFm = app.metadataCache.getFileCache(exportFile)?.frontmatter;
	const docVal: unknown = docFm?.[TEMPLATE_DOC_KEY];
	if (typeof docVal === 'string' && docVal.trim() !== '') return docVal;

	const brandingRef: unknown = docFm?.[BRANDING_DOC_KEY];
	if (typeof brandingRef === 'string' && brandingRef.trim() !== '') {
		const brandingFile = app.metadataCache.getFirstLinkpathDest(
			stripWikilink(brandingRef),
			exportFile.path,
		);
		if (brandingFile) {
			const bVal: unknown = app.metadataCache.getFileCache(brandingFile)?.frontmatter?.[
				TEMPLATE_DOC_KEY
			];
			if (typeof bVal === 'string' && bVal.trim() !== '') return bVal;
		}
	}
	return null;
}

/**
 * Resolve and materialize a custom template for an export doc.
 * Returns `{ name: null }` when no `template:` key is set (Eisvogel fallback).
 * Throws when the key is set but the file can't be resolved.
 */
export function prepareTemplate(
	app: App,
	exportFile: TFile,
	workDir: string,
	vaultBasePath: string,
): PreparedTemplate {
	const raw = readTemplateRef(app, exportFile);
	if (!raw) return { name: null, missingPreamble: false };

	const linkpath = stripWikilink(raw);
	const tplFile =
		app.metadataCache.getFirstLinkpathDest(linkpath, exportFile.path) ??
		(/\.tex$/i.test(linkpath)
			? null
			: app.metadataCache.getFirstLinkpathDest(`${linkpath}.tex`, exportFile.path));
	if (!tplFile) {
		throw new Error(
			`Custom template not found: "${linkpath}" ` +
				`(referenced via "${TEMPLATE_DOC_KEY}"). ` +
				`Make sure the .tex file exists in the vault.`,
		);
	}

	const destAbs = join(workDir, 'custom-template.tex');
	copyFileSync(join(vaultBasePath, tplFile.path), destAbs);

	let missingPreamble = false;
	try {
		missingPreamble = !readFileSync(destAbs, 'utf8').includes('NOPE-IMPORTS');
	} catch {
		// Non-fatal: leave the flag false if the copy can't be re-read.
	}

	return { name: tplFile.basename, missingPreamble };
}
