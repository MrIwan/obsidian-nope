// Resolve branding overrides from vault; copy assets and generate YAML config for LaTeX.

import { App, TFile } from 'obsidian';
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

export const BRANDING_DOC_KEY = 'nope-branding';

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;
const SINGLE_WIKILINK_REGEX = /^\s*\[\[([^\]]+)\]\]\s*$/;

// Header/footer keys auto-expand solo image wikilinks to LaTeX \raisebox{}{\includegraphics{}} snippets.
const HEADER_FOOTER_KEYS = new Set([
	'header-left',
	'header-center',
	'header-right',
	'footer-left',
	'footer-center',
	'footer-right',
]);

// Supported image formats for logo auto-expansion.
const LOGO_IMAGE_EXTS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.pdf',
]);

const DEFAULT_LOGO_HEIGHT = '0.7cm';

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
 * Returns `null` when the doc has no `nope-branding` key (no override).
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
	// Read export doc frontmatter to locate branding file reference.
	const docCache = app.metadataCache.getFileCache(exportFile);
	const rawRef: unknown = docCache?.frontmatter?.[BRANDING_DOC_KEY];
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

	// Resolve branding file via wikilink.
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

	// Extract branding configuration from file frontmatter.
	const brandingCache = app.metadataCache.getFileCache(brandingFile);
	const fm = brandingCache?.frontmatter;
	if (!fm || Object.keys(fm).length === 0) {
		throw new Error(
			`Branding file has no frontmatter: ${brandingFile.path}`,
		);
	}

	// Resolve all wikilinks and copy asset files to build directory.
	const brandingAssetsDir = join(workDir, 'branding');
	mkdirSync(brandingAssetsDir, { recursive: true });
	const containerBrandingDir = `/build/${baseName}/branding`;
	const copiedAssets: string[] = [];

	// Resolve linkpath, copy asset, return container path.
	const copyAssetByLinkpath = (linkpath: string): string => {
		const asset = app.metadataCache.getFirstLinkpathDest(linkpath, brandingFile.path);
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

	const resolveAndCopy = (linkInner: string): string => {
		return copyAssetByLinkpath(stripLinkExtras(linkInner));
	};

	// Auto-expand solo image wikilinks to LaTeX; user can set height via |h=<value> suffix.
	const expandLogoWikilink = (linkInner: string): string => {
		const { linkpath, height } = parseLogoLinkInner(linkInner);
		const containerPath = copyAssetByLinkpath(linkpath);
		const h = height ?? DEFAULT_LOGO_HEIGHT;
		return `\\raisebox{-0.3\\height}{\\includegraphics[height=${h}]{${containerPath}}}`;
	};

	const processValue = (val: unknown): unknown => {
		if (typeof val === 'string') {
			return val.replace(WIKILINK_REGEX, (_full, inner: string) =>
				resolveAndCopy(inner),
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
		// No recursion: ignore an `nope-branding` key inside the branding file.
		if (k === BRANDING_DOC_KEY) continue;
		// Obsidian writes its internal position/tags caches into the same object —
		// metadataCache adds `position` for some plugins; defensively strip it.
		if (k === 'position') continue;

		// Header/Footer + solo image wikilink → \raisebox{}{\includegraphics{}}.
		// Mixed strings (e.g. "Draft – [[logo.png]]") and non-image targets
		// fall through to plain path-substitution.
		if (HEADER_FOOTER_KEYS.has(k) && typeof v === 'string') {
			const soloMatch = SINGLE_WIKILINK_REGEX.exec(v);
			const inner = soloMatch?.[1];
			if (inner) {
				const probe = parseLogoLinkInner(inner);
				if (isLogoImage(probe.linkpath)) {
					resolved[k] = expandLogoWikilink(inner);
					continue;
				}
			}
		}

		resolved[k] = processValue(v);
	}

	// Write generated branding YAML file.
	const yamlBody = serializeYaml(resolved);
	const headerComment =
		'# Auto-generated by nope. Do not edit by hand.\n' +
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

/**
 * Parse the inner of a wikilink to extract:
 *   - the canonical linkpath (alias/anchor stripped)
 *   - an optional height hint from a trailing `|h=<value>` segment
 *
 * Examples:
 *   "logo.png"               → { linkpath: "logo.png",        height: null  }
 *   "logo.png|h=1.2cm"       → { linkpath: "logo.png",        height: "1.2cm" }
 *   "logo.png|Alt|h=1.2cm"   → { linkpath: "logo.png",        height: "1.2cm" }
 *   "sub/logo.png#anchor"    → { linkpath: "sub/logo.png",    height: null  }
 */
function parseLogoLinkInner(inner: string): { linkpath: string; height: string | null } {
	let remainder = inner.trim();
	let height: string | null = null;

	// Extract optional |h=<value> height suffix from wikilink.
	const m = /^(.*)\|\s*h\s*=\s*([^|]+?)\s*$/.exec(remainder);
	if (m && m[1] !== undefined && m[2]) {
		remainder = m[1];
		height = m[2].trim();
	}

	return { linkpath: stripLinkExtras(remainder), height };
}

/** True if the path ends with an extension we accept for header/footer logos. */
function isLogoImage(linkpath: string): boolean {
	const lower = linkpath.toLowerCase();
	for (const ext of LOGO_IMAGE_EXTS) {
		if (lower.endsWith(ext)) return true;
	}
	return false;
}

// YAML serialization for branding config; quoted strings preserve LaTeX syntax.

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
