// Branding-Override resolver.
//
// Convention: an Obsidian `.md`-File with YAML-Frontmatter holds branding keys
// that override `pipeline/app/branding/_base.yml`. The export doc points at it
// via the frontmatter key `obsi-print-branding: "[[Branding-File]]"`.
//
// Pipeline:
//   1. Read doc frontmatter → get branding-ref.
//   2. Resolve wikilink via metadataCache.getFirstLinkpathDest.
//   3. Read branding file's frontmatter (body ignored).
//   4. Walk all string values, replace [[…]] with container paths,
//      copy referenced files into build/<docname>/branding/.
//   5. Write build/<docname>/branding-override.yml.
//   6. build.sh detects the file and appends --metadata-file to pandoc.

import { App, TFile } from 'obsidian';
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

export const BRANDING_DOC_KEY = 'obsi-print-branding';

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;
const SINGLE_WIKILINK_REGEX = /^\s*\[\[([^\]]+)\]\]\s*$/;

export interface PreparedBranding {
	/** Absolute host path of the generated override file. */
	hostPath: string;
	/** Path inside the Docker container. */
	containerPath: string;
	/** Names of asset files that were copied into the build branding dir. */
	copiedAssets: string[];
}

/**
 * Resolve & materialize the branding override for a given export doc.
 *
 * Returns `null` when the doc has no `obsi-print-branding` key (no override).
 * Throws when the key is set but resolution fails — caller decides how to
 * surface the error (the export command shows a Notice and aborts).
 */
export function prepareBrandingOverride(
	app: App,
	exportFile: TFile,
	workDir: string,
	vaultBasePath: string,
	baseName: string,
): PreparedBranding | null {
	// 1. Read doc frontmatter.
	const docCache = app.metadataCache.getFileCache(exportFile);
	const rawRef = docCache?.frontmatter?.[BRANDING_DOC_KEY];
	if (rawRef === undefined || rawRef === null || rawRef === '') {
		return null;
	}
	if (typeof rawRef !== 'string') {
		throw new Error(
			`Frontmatter key "${BRANDING_DOC_KEY}" must be a wikilink string ` +
				`like "[[Branding-File]]". Got: ${JSON.stringify(rawRef)}`,
		);
	}

	const refMatch = SINGLE_WIKILINK_REGEX.exec(rawRef);
	const refInner = refMatch?.[1];
	if (!refInner) {
		throw new Error(
			`Frontmatter key "${BRANDING_DOC_KEY}" must be a quoted wikilink ` +
				`like "[[Branding-File]]". Got: "${rawRef}"`,
		);
	}
	const brandingLinkpath = stripLinkExtras(refInner);

	// 2. Resolve the branding file.
	const brandingFile = app.metadataCache.getFirstLinkpathDest(
		brandingLinkpath,
		exportFile.path,
	);
	if (!brandingFile) {
		throw new Error(
			`Branding file not found: "${brandingLinkpath}" ` +
				`(referenced via "${BRANDING_DOC_KEY}" in ${exportFile.path}).`,
		);
	}

	// 3. Read branding frontmatter.
	const brandingCache = app.metadataCache.getFileCache(brandingFile);
	const fm = brandingCache?.frontmatter;
	if (!fm || Object.keys(fm).length === 0) {
		throw new Error(
			`Branding file has no frontmatter: ${brandingFile.path}`,
		);
	}

	// 4. Walk strings, resolve wikilinks, copy assets.
	const brandingAssetsDir = join(workDir, 'branding');
	mkdirSync(brandingAssetsDir, { recursive: true });
	const containerBrandingDir = `/build/${baseName}/branding`;
	const copiedAssets: string[] = [];

	const resolveAndCopy = (linkInner: string, sourceContext: string): string => {
		const linkpath = stripLinkExtras(linkInner);
		const asset = app.metadataCache.getFirstLinkpathDest(linkpath, sourceContext);
		if (!asset) {
			throw new Error(
				`Branding asset not found: "${linkpath}" ` +
					`(referenced in ${brandingFile.path}).`,
			);
		}
		const sourceAbs = join(vaultBasePath, asset.path);
		const destName = basename(asset.path);
		const destAbs = join(brandingAssetsDir, destName);
		copyFileSync(sourceAbs, destAbs);
		if (!copiedAssets.includes(destName)) {
			copiedAssets.push(destName);
		}
		return `${containerBrandingDir}/${destName}`;
	};

	const processValue = (val: unknown): unknown => {
		if (typeof val === 'string') {
			return val.replace(WIKILINK_REGEX, (_full, inner: string) =>
				resolveAndCopy(inner, brandingFile.path),
			);
		}
		if (Array.isArray(val)) {
			return val.map(processValue);
		}
		if (val !== null && typeof val === 'object') {
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
				out[k] = processValue(v);
			}
			return out;
		}
		return val;
	};

	const resolved: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(fm)) {
		// No recursion: ignore an `obsi-print-branding` key inside the branding file.
		if (k === BRANDING_DOC_KEY) continue;
		// Obsidian writes its internal position/tags caches into the same object —
		// metadataCache adds `position` for some plugins; defensively strip it.
		if (k === 'position') continue;
		resolved[k] = processValue(v);
	}

	// 5. Write override YAML.
	const yamlBody = serializeYaml(resolved);
	const headerComment =
		'# Auto-generated by obsi-print. Do not edit by hand.\n' +
		`# Source: ${brandingFile.path}\n` +
		`# Doc:    ${exportFile.path}\n\n`;
	const overridePath = join(workDir, 'branding-override.yml');
	writeFileSync(overridePath, headerComment + yamlBody);

	return {
		hostPath: overridePath,
		containerPath: `/build/${baseName}/branding-override.yml`,
		copiedAssets,
	};
}

/** Strip alias and heading/block-id suffix from a wikilink target. */
function stripLinkExtras(inner: string): string {
	let target = inner;
	const pipe = target.indexOf('|');
	if (pipe >= 0) target = target.slice(0, pipe);
	const hash = target.indexOf('#');
	if (hash >= 0) target = target.slice(0, hash);
	return target.trim();
}

// ----- YAML serialization ---------------------------------------------------
// Minimal serializer for the shapes we expect from Obsidian's metadataCache:
// scalars (string | number | boolean | null), arrays of scalars, and nested
// objects. Strings are double-quoted so embedded LaTeX backslashes, dollars
// and braces stay literal — Pandoc reads YAML, not the LaTeX inside.

function serializeYaml(obj: Record<string, unknown>): string {
	const lines: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		lines.push(formatPair(k, v, 0));
	}
	return lines.join('\n') + '\n';
}

function formatPair(key: string, val: unknown, depth: number): string {
	const indent = '  '.repeat(depth);
	if (val === null || val === undefined) {
		return `${indent}${key}: null`;
	}
	if (typeof val === 'boolean' || typeof val === 'number') {
		return `${indent}${key}: ${val}`;
	}
	if (typeof val === 'string') {
		return `${indent}${key}: ${quoteString(val)}`;
	}
	if (Array.isArray(val)) {
		if (val.length === 0) return `${indent}${key}: []`;
		const itemIndent = '  '.repeat(depth);
		const items = val.map((item) => `${itemIndent}- ${formatInlineValue(item)}`);
		return `${indent}${key}:\n${items.join('\n')}`;
	}
	if (typeof val === 'object') {
		const sub = Object.entries(val as Record<string, unknown>)
			.map(([k, v]) => formatPair(k, v, depth + 1))
			.join('\n');
		return `${indent}${key}:\n${sub}`;
	}
	return `${indent}${key}: ${JSON.stringify(val)}`;
}

function formatInlineValue(val: unknown): string {
	if (val === null || val === undefined) return 'null';
	if (typeof val === 'boolean' || typeof val === 'number') return String(val);
	if (typeof val === 'string') return quoteString(val);
	// Object/array nested in an array — fall back to JSON (still valid YAML
	// flow style). Branding files won't realistically hit this.
	return JSON.stringify(val);
}

function quoteString(s: string): string {
	const escaped = s
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t');
	return `"${escaped}"`;
}
