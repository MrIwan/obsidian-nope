// Generate branding template file with documented frontmatter keys.

import { Notice, normalizePath, TFile } from 'obsidian';
import type ObsiPrintPlugin from '../main';

const TEMPLATE_FILENAME = 'Branding-Template.md';

export function registerBrandingTemplateCommand(plugin: ObsiPrintPlugin): void {
	plugin.addCommand({
		id: 'create-branding-template',
		name: 'Create branding template',
		callback: async () => {
			await createBrandingTemplate(plugin);
		},
	});
}

// Return next available numbered path if filename already exists.
function pickAvailablePath(plugin: ObsiPrintPlugin, filename: string): string {
	const dotIdx = filename.lastIndexOf('.');
	const stem = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
	const ext = dotIdx >= 0 ? filename.slice(dotIdx) : '';
	let candidate = normalizePath(filename);
	let n = 2;
	while (plugin.app.vault.getAbstractFileByPath(candidate) !== null) {
		candidate = normalizePath(`${stem}-${n}${ext}`);
		n += 1;
	}
	return candidate;
}

async function createBrandingTemplate(plugin: ObsiPrintPlugin): Promise<void> {
	// Use numbered suffix to avoid overwriting existing branding templates.
	const path = pickAvailablePath(plugin, TEMPLATE_FILENAME);

	try {
		const file = await plugin.app.vault.create(path, TEMPLATE_CONTENT);
		new Notice(`Branding template created: ${path}`);
		if (file instanceof TFile) {
			await plugin.app.workspace.openLinkText(file.path, '', false);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Could not create branding template: ${msg}`, 10000);
	}
}

// Template content with branding keys and documentation (German prose for user).
const TEMPLATE_CONTENT = `---
# === Language =============================================================
lang: en

# === Table of Contents ====================================================
toc: true
toc-own-page: true
toc-depth: 3
lof: true
lot: true

# === Title Page ===========================================================
titlepage: true
titlepage-color: "FFFFFF"
titlepage-text-color: "1A1A1A"
# Wikilinks MUST be quoted — otherwise YAML parses as list.
titlepage-background: "[[bg.png]]"
titlepage-logo: "[[logo.png]]"

# === Header ===============================================================
# Plain Text: header-left: "Draft"
# Logo (Wikilink auto-expands to \\raisebox{}{\\includegraphics{}}):
#   header-left: "[[logo-horizontal.png]]"            → Default height 0.7cm
#   header-left: "[[logo-horizontal.png|h=1cm]]"      → Custom height
header-left: "[[logo-horizontal.png]]"
---

# Branding Template

This file defines **branding overrides** for \`obsi-print\`. Duplicate it per customer
(e.g., \`Branding-Customer1.md\`) and edit the frontmatter keys above.
Enable branding in an export note by adding to its frontmatter:

\`\`\`yaml
obsi-print-branding: "[[Branding-Customer1]]"
\`\`\`

If unset, the plugin uses defaults from \`_base.yml\`.

## Key Rules

- **Always quote wikilinks**: \`"[[logo.png]]"\`, not \`[[logo.png]]\`. Unquoted
  wikilinks are parsed as YAML lists and values fail.
- **Body ignored on export**. Document freely here without side effects.
- **Export frontmatter overrides branding overrides \`_base.yml\`**. A key in the
  export note locally overrides branding, which overrides plugin defaults.

## Key Reference

### Language

- \`lang\`: Language code (e.g., \`en\`, \`de\`). Controls Babel in LaTeX template,
  sets \`Figure\`/\`Table\`/\`Equation\` captions and \`\\autoref\` labels.

### Table of Contents

- \`toc\`: Generate table of contents.
- \`toc-own-page\`: Place TOC on separate page (true) or inline (false).
- \`toc-title\`: Title of the TOC.
- \`toc-depth\`: Heading depth for TOC entries (1–6).
- \`lof\`: Generate list of figures.
- \`lot\`: Generate list of tables.

### Title Page

- \`titlepage\`: Generate title page.
- \`titlepage-color\`: Title page background color (hex without \`#\`,
  e.g., \`FFFFFF\` for white).
- \`titlepage-text-color\`: Title page text color (hex without \`#\`).
- \`titlepage-background\`: Full-width background image for title page.
  Use wikilink format: \`"[[bg.png]]"\`. Image can be anywhere in vault;
  plugin resolves it via Obsidian's link resolution.
- \`titlepage-logo\`: Logo placed at top of title page. Also as wikilink.

### Header and Footer

For \`header-left\`, \`header-center\`, \`header-right\`, \`footer-left\`,
\`footer-center\`, and \`footer-right\`:

- **Plain text**: \`header-left: "Draft"\` renders text directly.
- **Logo via wikilink**: \`header-left: "[[logo-horizontal.png]]"\` auto-expands to
  \`\`\`tex
  \\raisebox{-0.3\\height}{\\includegraphics[height=0.7cm]{<path>}}
  \`\`\`
  Default height is \`0.7cm\`; override with optional \`|h=<value>\` suffix:
  \`"[[logo.png|h=1.2cm]]"\`. Accepted units: \`cm\`, \`mm\`, \`pt\`, \`em\`,
  and LaTeX lengths like \`0.5\\textheight\`.
- **Mixed mode (text + logo)**: Write the LaTeX snippet manually; embedded
  \`[[…]]\` still resolve to container paths, e.g.:
  \`\`\`yaml
  header-left: "Draft – \\\\includegraphics[height=0.5cm]{[[logo.png]]}"
  \`\`\`

## Tips

- Store all branding assets (logos, backgrounds) centrally in one folder,
  e.g., \`/branding/customer-1/\`, to keep the vault organized.
- For ambiguous filenames, use absolute paths with leading slash:
  \`"[[/branding/customer-1/logo.png]]"\`.
- You can override any Pandoc/Eisvogel key not listed here — resolution is
  key-agnostic, and new keys work without plugin updates.
`;
