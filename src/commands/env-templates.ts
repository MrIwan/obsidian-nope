// Scaffold command for latex-env atomic notes: one "Add structured note" command
// opens a picker with all note types; the chosen template creates a note with the
// correct frontmatter + body skeleton and inserts an embed/ref at the cursor.

import { Editor, FuzzySuggestModal, MarkdownFileInfo, MarkdownView, Notice, TFile, normalizePath } from 'obsidian';
import type NopePlugin from '../main';

// One entry per picker option. `embed` decides the insert syntax:
// true → block embed ![[…]], false → plain ref [[…]] (glossary terms).
interface EnvTemplate {
	id: string;
	name: string;
	defaultName: string;
	embed: boolean;
	content: string;
}

// Fence built from a variable so the template literal isn't broken by backticks.
const MERMAID_FENCE = ['```mermaid', 'flowchart LR', '  A[Start] --> B[End]', '```'].join('\n');

const TEMPLATES: EnvTemplate[] = [
	{
		id: 'add-table',
		name: 'Add table',
		defaultName: 'New table',
		embed: true,
		content: `---
latex-env: table
caption: "Table caption"
longtable: false
align: center
---

| Column A | Column B |
| --- | --- |
|  |  |
`,
	},
	{
		id: 'add-base-table',
		name: 'Add base table',
		defaultName: 'New base table',
		embed: true,
		content: `---
latex-env: table
caption: "Base table caption"
longtable: false
align: center
---

![[Base.base#View]]
`,
	},
	{
		id: 'add-theorem',
		name: 'Add theorem',
		defaultName: 'New theorem',
		embed: true,
		content: `---
latex-env: theorem
---

State the theorem here. No headings — an optional short title goes into latex-short in the frontmatter.
`,
	},
	{
		id: 'add-lemma',
		name: 'Add lemma',
		defaultName: 'New lemma',
		embed: true,
		content: `---
latex-env: lemma
---

State the lemma here. No headings — an optional short title goes into latex-short in the frontmatter.
`,
	},
	{
		id: 'add-definition',
		name: 'Add definition',
		defaultName: 'New definition',
		embed: true,
		content: `---
latex-env: definition
---

State the definition here. No headings — an optional short title goes into latex-short in the frontmatter.
`,
	},
	{
		id: 'add-proof',
		name: 'Add proof',
		defaultName: 'New proof',
		embed: true,
		content: `---
latex-env: proof
---

Write the proof here. No headings in the body.
`,
	},
	{
		id: 'add-mermaid',
		name: 'Add mermaid diagram',
		defaultName: 'New diagram',
		embed: true,
		content: `---
latex-env: mermaid
caption: "Diagram caption"
w: "50%"
scale: 2
---

${MERMAID_FENCE}
`,
	},
	{
		id: 'add-equation',
		name: 'Add equation',
		defaultName: 'New equation',
		embed: true,
		content: `---
latex-env: equation
---

$$
a^2 + b^2 = c^2
$$
`,
	},
	{
		id: 'add-glossary-term',
		name: 'Add glossary term',
		defaultName: 'New glossary term',
		embed: false,
		content: `---
gls-id: term-id
gls-short: Term
gls-long: Full term name
gls-description: Definition of the term.
gls-type: term
---

Referenced from any note via [[<note name>]], which renders as \\gls{term-id}.
The glossary entry is built from the frontmatter above; this body is not exported.
`,
	},
	{
		id: 'add-abbreviation',
		name: 'Add abbreviation',
		defaultName: 'New abbreviation',
		embed: false,
		content: `---
gls-id: abbr-id
gls-short: ABBR
gls-long: Full expansion of the abbreviation
gls-description: ""
gls-type: acronym
---

Referenced from any note via [[<note name>]], which renders as \\gls{abbr-id}.
The acronym entry is built from the frontmatter above; this body is not exported.
`,
	},
];

// Return next available numbered path if the target already exists.
function pickAvailablePath(plugin: NopePlugin, candidatePath: string): string {
	const dotIdx = candidatePath.lastIndexOf('.');
	const stem = dotIdx >= 0 ? candidatePath.slice(0, dotIdx) : candidatePath;
	const ext = dotIdx >= 0 ? candidatePath.slice(dotIdx) : '';
	let candidate = normalizePath(candidatePath);
	let n = 2;
	while (plugin.app.vault.getAbstractFileByPath(candidate) !== null) {
		candidate = normalizePath(`${stem}-${n}${ext}`);
		n += 1;
	}
	return candidate;
}

// Create the atom note next to the host note, then insert the link at the cursor.
async function createEnvNote(
	plugin: NopePlugin,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	tpl: EnvTemplate,
): Promise<void> {
	const host = ctx.file;
	if (!host) {
		new Notice('Open a note first.');
		return;
	}

	// Same folder as the host note; vault root stays unprefixed.
	const folder = host.parent && host.parent.path !== '/' ? host.parent.path : '';
	const target = folder ? `${folder}/${tpl.defaultName}.md` : `${tpl.defaultName}.md`;
	const path = pickAvailablePath(plugin, target);
	const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

	try {
		const file = await plugin.app.vault.create(path, tpl.content);
		// Vault is basename-indexed, so a bare name resolves the wikilink.
		editor.replaceSelection(tpl.embed ? `![[${stem}]]` : `[[${stem}]]`);
		new Notice(`Created ${stem}`);
		if (file instanceof TFile) {
			await plugin.app.workspace.openLinkText(file.path, '', 'tab');
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Could not create note: ${msg}`, 10000);
	}
}

// Fuzzy-searchable submenu listing all note types ("Table", "Mermaid diagram", …).
class EnvTemplateModal extends FuzzySuggestModal<EnvTemplate> {
	constructor(
		private plugin: NopePlugin,
		private editor: Editor,
		private ctx: MarkdownView | MarkdownFileInfo,
	) {
		super(plugin.app);
		this.setPlaceholder('Pick a note type…');
	}

	getItems(): EnvTemplate[] {
		return TEMPLATES;
	}

	getItemText(tpl: EnvTemplate): string {
		// Picker shows the bare type: "Add table" → "Table".
		const label = tpl.name.replace(/^Add /, '');
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	onChooseItem(tpl: EnvTemplate): void {
		void createEnvNote(this.plugin, this.editor, this.ctx, tpl);
	}
}

export function registerEnvTemplateCommands(plugin: NopePlugin): void {
	plugin.addCommand({
		id: 'add-env-note',
		name: 'Add structured note',
		editorCallback: (editor, ctx) => {
			new EnvTemplateModal(plugin, editor, ctx).open();
		},
	});
}
