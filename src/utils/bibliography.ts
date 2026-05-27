// Bibliography resolver — Pandoc-citeproc bridge.
//
// Convention: a `.bib`-file (BibTeX/BibLaTeX) somewhere in the vault, plus an
// optional CSL-stylesheet. The export doc points at them via frontmatter:
//
//   bibliography: "References/Sources.bib"   # plain path or wikilink
//   csl: "chicago-author-date"               # preinstalled name OR path/wikilink
//
// Pipeline (mirrors branding-override):
//   1. Read doc frontmatter via metadataCache.
//   2. Resolve the linkpath via metadataCache.getFirstLinkpathDest — handles
//      Obsidian's vault index, aliased paths, and folders with spaces without
//      any quoting drama.
//   3. Copy the file into build/<docname>/ under a fixed name
//      (`references.bib`, `citation-style.csl`).
//   4. build.sh just probes for those filenames and appends
//      `--citeproc --bibliography=… [--csl=…]` to the Pandoc invocation.
//
// build.sh stays dumb on purpose: no YAML parsing, no vault traversal, no
// path resolution. Same pattern as branding-override.yml.

import { App, TFile } from 'obsidian';
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';

export const BIBLIOGRAPHY_DOC_KEY = 'bibliography';
export const CSL_DOC_KEY = 'csl';

const SINGLE_WIKILINK_REGEX = /^\s*\[\[([^\]]+)\]\]\s*$/;

export interface PreparedBibliography {
	/** Absolute host path of the materialized references.bib. */
	bibHostPath: string;
	/** Absolute host path of the materialized citation-style.csl, or null. */
	cslHostPath: string | null;
	/** True if the CSL was sourced from the plugin's preinstalled set. */
	cslPreinstalled: boolean;
}

/**
 * Resolve and materialize the bibliography (and optional CSL) for an export doc.
 *
 * Returns `null` when the doc has no `bibliography` frontmatter key.
 * Throws when the key is set but the file can't be resolved — caller decides
 * how to surface the error (the export command shows a Notice and aborts).
 *
 * Output filenames in `workDir` are FIXED (`references.bib`,
 * `citation-style.csl`) so build.sh can probe for them without parsing
 * frontmatter.
 */
export function prepareBibliography(
	app: App,
	exportFile: TFile,
	workDir: string,
	vaultBasePath: string,
	pluginDir: string,
): PreparedBibliography | null {
	// 1. Read doc frontmatter.
	const docCache = app.metadataCache.getFileCache(exportFile);
	const rawBib: unknown = docCache?.frontmatter?.[BIBLIOGRAPHY_DOC_KEY];
	if (rawBib === undefined || rawBib === null || rawBib === '') {
		return null;
	}
	if (typeof rawBib !== 'string') {
		throw new Error(
			`Frontmatter key "${BIBLIOGRAPHY_DOC_KEY}" must be a string ` +
				`(path or wikilink). Got: ${JSON.stringify(rawBib)}`,
		);
	}

	const bibLinkpath = stripWikilink(rawBib);
	const bibFile = app.metadataCache.getFirstLinkpathDest(bibLinkpath, exportFile.path);
	if (!bibFile) {
		throw new Error(
			`Bibliography file not found: "${bibLinkpath}" ` +
				`(referenced via "${BIBLIOGRAPHY_DOC_KEY}" in ${exportFile.path}). ` +
				`Make sure the file exists in the vault.`,
		);
	}

	// 3. Copy .bib → $WORK/references.bib (canonical name).
	const bibSourceAbs = join(vaultBasePath, bibFile.path);
	const bibDestAbs = join(workDir, 'references.bib');
	copyFileSync(bibSourceAbs, bibDestAbs);

	// 4. CSL is optional. Two resolution modes (preinstalled name wins):
	//   (a) `csl: chicago-author-date` → look up
	//       <pluginDir>/pipeline/app/csl/chicago-author-date.csl
	//   (b) `csl: "References/MyStyle.csl"` or `csl: "[[MyStyle.csl]]"` →
	//       resolve via metadataCache like the .bib.
	//
	// Either way the file is copied to $WORK/citation-style.csl, so build.sh
	// only has to probe one filename.
	let cslDestAbs: string | null = null;
	let cslPreinstalled = false;

	const rawCsl: unknown = docCache?.frontmatter?.[CSL_DOC_KEY];
	if (typeof rawCsl === 'string' && rawCsl.trim() !== '') {
		const cslLinkpath = stripWikilink(rawCsl);

		// (a) Preinstalled style name.
		const preinstalledPath = join(
			pluginDir,
			'pipeline',
			'app',
			'csl',
			`${cslLinkpath}.csl`,
		);

		let cslSourceAbs: string | null = null;
		if (existsSync(preinstalledPath)) {
			cslSourceAbs = preinstalledPath;
			cslPreinstalled = true;
		} else {
			// (b) Vault file via linkpath resolution.
			const cslFile = app.metadataCache.getFirstLinkpathDest(
				cslLinkpath,
				exportFile.path,
			);
			if (cslFile) {
				cslSourceAbs = join(vaultBasePath, cslFile.path);
			}
		}

		if (!cslSourceAbs) {
			throw new Error(
				`CSL style not found: "${cslLinkpath}" ` +
					`(referenced via "${CSL_DOC_KEY}" in ${exportFile.path}). ` +
					`Expected either a preinstalled name (pipeline/app/csl/<name>.csl) ` +
					`or a .csl file in the vault.`,
			);
		}

		cslDestAbs = join(workDir, 'citation-style.csl');
		copyFileSync(cslSourceAbs, cslDestAbs);
	}

	return {
		bibHostPath: bibDestAbs,
		cslHostPath: cslDestAbs,
		cslPreinstalled,
	};
}

/**
 * Accept either a plain linkpath ("References/Sources.bib") or a wikilink-
 * wrapped value ("[[Sources.bib]]"). Strips brackets and any alias suffix.
 * Returns the trimmed inner linkpath.
 */
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
