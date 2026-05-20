// Command: "Create branding template".
//
// Writes a `Branding-Template.md` to the vault root. Frontmatter contains all
// keys currently shipped in `pipeline/app/branding/_base.yml`, ready to be
// duplicated per customer. The body documents what each key does so the user
// can edit confidently inside Obsidian — body is ignored on export, it is
// pure documentation.

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

async function createBrandingTemplate(plugin: ObsiPrintPlugin): Promise<void> {
	const path = normalizePath(TEMPLATE_FILENAME);
	const existing = plugin.app.vault.getAbstractFileByPath(path);

	if (existing instanceof TFile) {
		// Confirm before overwriting — user may have customized the existing one.
		const ok = window.confirm(
			`"${path}" already exists. Overwrite with a fresh template?`,
		);
		if (!ok) {
			new Notice('Branding template not changed.');
			return;
		}
		await plugin.app.vault.modify(existing, TEMPLATE_CONTENT);
		new Notice(`Branding template overwritten: ${path}`);
		// Open the file so the user lands inside it.
		await plugin.app.workspace.openLinkText(path, '', false);
		return;
	}

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

// -----------------------------------------------------------------------------
// Template content. Frontmatter mirrors `pipeline/app/branding/_base.yml`; body
// is German prose documentation. Keep these in sync when `_base.yml` changes.
const TEMPLATE_CONTENT = `---
# === Sprache ==============================================================
lang: de

# === Inhaltsverzeichnis ===================================================
toc: true
toc-own-page: true
toc-title: "Inhaltsverzeichnis"
toc-depth: 3
lof: true
lot: true

# === Titelseite ===========================================================
titlepage: true
titlepage-color: "FFFFFF"
titlepage-text-color: "1A1A1A"
# Wikilinks MÜSSEN in Anführungszeichen — sonst parst YAML das als Liste.
titlepage-background: "[[bg.png]]"
titlepage-logo: "[[logo.png]]"

# === Kopfzeile ============================================================
# Plain Text: header-left: "Draft"
# Logo (Wikilink wird zu \\raisebox{}{\\includegraphics{}} expandiert):
#   header-left: "[[logo-horizontal.png]]"            → Default-Höhe 0.7cm
#   header-left: "[[logo-horizontal.png|h=1cm]]"      → eigene Höhe
header-left: "[[logo-horizontal.png]]"
---

# Branding-Template

Diese Datei ist eine **Branding-Definition** für \`obsi-print\`. Dupliziere sie pro
Kunde (z. B. \`Branding-Kunde1.md\`) und passe die Werte oben im Frontmatter an.
Aktiviere ein Branding in einer Export-Note, indem du im Frontmatter dieser Note

\`\`\`yaml
obsi-print-branding: "[[Branding-Kunde1]]"
\`\`\`

setzt. Ist der Key nicht gesetzt, gelten die Plugin-Defaults aus \`_base.yml\`.

## Wichtige Regeln

- **Wikilinks immer quoten**: \`"[[logo.png]]"\`, nicht \`[[logo.png]]\`. Ohne
  Anführungszeichen interpretiert YAML das als Liste-in-Liste und der Wert
  wird falsch geparst.
- **Body wird beim Export ignoriert**. Hier kannst du also dokumentieren ohne
  Nebenwirkungen.
- **Doc-Frontmatter schlägt Branding schlägt \`_base.yml\`**. Ein Key in der
  Export-Note überschreibt also lokal das Branding, das Branding überschreibt
  die Plugin-Defaults.

## Was die Keys bedeuten

### Sprache

- \`lang\`: Sprachcode (z. B. \`de\`, \`en\`). Steuert Babel im LaTeX-Template,
  setzt damit \`Abbildung\`/\`Tabelle\`/\`Gleichung\` als Caption- und
  \`\\autoref\`-Namen.

### Inhaltsverzeichnis (TOC = Table of Contents)

- \`toc\`: Inhaltsverzeichnis überhaupt erzeugen.
- \`toc-own-page\`: TOC auf eigener Seite (true) oder direkt am Anfang (false).
- \`toc-title\`: Überschrift des TOC.
- \`toc-depth\`: Heading-Tiefe, bis zu der Einträge erscheinen (1–6).
- \`lof\`: Abbildungsverzeichnis (List of Figures) erzeugen.
- \`lot\`: Tabellenverzeichnis (List of Tables) erzeugen.

### Titelseite

- \`titlepage\`: Titelseite überhaupt erzeugen.
- \`titlepage-color\`: Hintergrundfarbe der Titelseite (Hex ohne \`#\`,
  z. B. \`FFFFFF\` für weiß).
- \`titlepage-text-color\`: Textfarbe auf der Titelseite (Hex ohne \`#\`).
- \`titlepage-background\`: Vollflächiges Hintergrundbild der Titelseite.
  Wikilink-Format: \`"[[bg.png]]"\`. Das Bild muss irgendwo im Vault liegen;
  das Plugin findet es automatisch via Obsidian-Linkresolution.
- \`titlepage-logo\`: Logo, das oben auf der Titelseite eingefügt wird.
  Ebenfalls als Wikilink.

### Kopf- und Fußzeile

Für \`header-left\`, \`header-center\`, \`header-right\`, \`footer-left\`,
\`footer-center\` und \`footer-right\` gilt:

- **Plain Text:** \`header-left: "Draft"\` rendert den Text direkt.
- **Logo per Wikilink:** \`header-left: "[[logo-horizontal.png]]"\` wird vom
  Plugin automatisch zu
  \`\`\`tex
  \\raisebox{-0.3\\height}{\\includegraphics[height=0.7cm]{<path>}}
  \`\`\`
  expandiert. Default-Höhe ist \`0.7cm\`; mit dem optionalen Suffix
  \`|h=<wert>\` kannst du das übersteuern: \`"[[logo.png|h=1.2cm]]"\`.
  Akzeptierte Einheiten: \`cm\`, \`mm\`, \`pt\`, \`em\` und LaTeX-Längen wie
  \`0.5\\textheight\`.
- **Mixed-Mode (Text + Logo zusammen):** wer Text und Logo in derselben
  Header-Zelle mischen will, schreibt das LaTeX-Snippet selbst — eingebettete
  \`[[…]]\` werden weiterhin zu Container-Pfaden resolved, also z. B.
  \`\`\`yaml
  header-left: "Draft – \\\\includegraphics[height=0.5cm]{[[logo.png]]}"
  \`\`\`

## Tipps

- Lege alle Branding-Assets (Logos, Hintergründe) zentral in einem Ordner ab,
  z. B. \`/branding/kunde-1/\`. So bleibt der Vault übersichtlich.
- Bei Mehrdeutigkeit (mehrere Dateien gleichen Namens) kannst du mit führendem
  Slash absolut adressieren: \`"[[/branding/kunde-1/logo.png]]"\`.
- Du kannst die hier nicht aufgeführten Pandoc-/Eisvogel-Keys ebenfalls
  überschreiben — die Resolution ist key-agnostisch, neue Keys funktionieren
  ohne Plugin-Update.
`;
