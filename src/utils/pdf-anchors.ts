// Map source anchors (pandoc heading ids, filter labels) to PDF named destinations via the .aux file.

import { existsSync, readFileSync } from 'fs';

// Replicate pandoc's auto_identifiers algorithm; verify against pandoc on major bumps.
export function pandocAutoIdentifier(text: string): string {
	const cleaned = text
		.replace(/[^\p{L}\p{N}\s_.-]/gu, '')
		.replace(/\s+/g, '-')
		.toLowerCase();
	// Identifiers may not begin with anything but a letter.
	const fromLetter = cleaned.replace(/^[^\p{L}]+/u, '');
	return fromLetter === '' ? 'section' : fromLetter;
}

// Mirror of sanitize_label_id in obsidian-transclude.lua (lua %w is ASCII-only).
export function sanitizeLabelId(s: string): string {
	return s.replace(/[^A-Za-z0-9_:-]/g, '_');
}

// \newlabel{<name>}{{num}{page}{title}{<dest>}{}} — title may nest braces, so anchor at line end.
export function parseAuxDestinations(auxPath: string): Map<string, string> {
	const map = new Map<string, string>();
	if (!existsSync(auxPath)) return map;
	for (const line of readFileSync(auxPath, 'utf8').split('\n')) {
		if (!line.startsWith('\\newlabel{')) continue;
		const nameEnd = line.indexOf('}');
		if (nameEnd < 0) continue;
		const name = line.slice('\\newlabel{'.length, nameEnd);
		const dest = line.match(/\{([^{}]*)\}\{[^{}]*\}\}$/)?.[1];
		if (name === '' || !dest) continue;
		// First occurrence wins, matching the filter's first-embed-label semantics.
		if (!map.has(name)) map.set(name, dest);
	}
	return map;
}
