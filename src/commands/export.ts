import { Notice, TFile } from 'obsidian';
import { shell } from 'electron';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type ObsiPrintPlugin from '../main';
import { buildImage, cleanupIntermediates, imageExists, runPipeline } from '../utils/docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath, resolveOutputPath } from '../utils/paths';
import { prepareBrandingOverride } from '../utils/branding';
import { prepareBibliography } from '../utils/bibliography';
import { getSkillStatus } from '../utils/skill';

export function registerExportCommand(plugin: ObsiPrintPlugin): void {
	plugin.addCommand({
		id: 'export-active-note',
		name: 'Export active note to PDF',
		callback: async () => {
			await exportActiveNote(plugin);
		},
	});
}

async function exportActiveNote(plugin: ObsiPrintPlugin): Promise<void> {
	// Get the active markdown file.
	const file = plugin.app.workspace.getActiveFile();
	if (!file || !(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
		new Notice('No active note to export.');
		return;
	}

	const pluginDir = getPluginAbsoluteDir(plugin);
	const vaultPath = getVaultAbsolutePath(plugin.app);

	// Hinweis (kein Block): wenn das AI-Conventions-Skill nicht im Vault liegt,
	// bekommen AI-Agents im Vault die Schreibkonvention nicht mit. Pipeline ist
	// davon unabhängig, also nur Notice → User-Settings statt Abbruch.
	if (getSkillStatus(pluginDir, vaultPath) === 'missing') {
		new Notice(
			'obsi-print: AI conventions skill nicht installiert. ' +
				'In den Plugin-Settings unter „AI conventions skill" auf „Install" klicken, ' +
				'damit AI-Agents die Schreibkonvention kennen.',
			10000,
		);
	}

	// Image must be built.
	if (!(await imageExists())) {
		new Notice('Docker image not found. Building it now. This may take a while…');
		try {
			await buildImage(pluginDir);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Failed to build Docker image. Try to build in the plugin settings. ${msg}`, 10000);
			return;
		}
	}

	// Resolve paths.
	const sourceAbs = join(vaultPath, file.path);
	const destPath = resolveOutputPath(plugin.settings.outputPath, sourceAbs, vaultPath);

	// Compute the per-doc build dir (host path that maps to /build/<base>/ in container).
	const baseName = file.basename;
	const workDir = join(pluginDir, 'pipeline', 'build', baseName);
	mkdirSync(workDir, { recursive: true });

	// Branding-Override (Feature 4): materialize per-export YAML + assets.
	// Aborts the export with a Notice if the doc references a branding file
	// that can't be resolved — better fail-loud than ship a PDF that silently
	// fell back to the base defaults.
	try {
		const prepared = prepareBrandingOverride(
			plugin.app,
			file,
			workDir,
			vaultPath,
			baseName,
		);
		if (prepared) {
			new Notice(
				`Branding override applied (${prepared.copiedAssets.length} asset(s)).`,
			);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Branding override failed. ${msg}`, 10000);
		return;
	}

	// Bibliography (Pandoc-citeproc bridge). Same idea as branding-override:
	// resolve via metadataCache here, copy to $WORK under fixed filenames
	// (`references.bib` / `citation-style.csl`), build.sh just probes for
	// the files. No frontmatter parsing or vault traversal in bash.
	try {
		const preparedBib = prepareBibliography(
			plugin.app,
			file,
			workDir,
			vaultPath,
			pluginDir,
		);
		if (preparedBib) {
			const cslPart = preparedBib.cslHostPath
				? preparedBib.cslPreinstalled
					? ' + preinstalled CSL'
					: ' + custom CSL'
				: '';
			new Notice(`Bibliography prepared${cslPart}.`);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Bibliography prep failed. ${msg}`, 10000);
		return;
	}

	// Run the pipeline.
	new Notice(`Exporting "${file.basename}"…`);
	let producedPdf: string;
	try {
		producedPdf = await runPipeline(pluginDir, vaultPath, file.path);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(`Export failed. ${msg}`, 10000);
		return;
	}

	// Copy the produced PDF to the user's destination.
	mkdirSync(dirname(destPath), { recursive: true });
	copyFileSync(producedPdf, destPath);

	// Drop the whole build/<doc>/ folder unless the user wants intermediates for debugging.
	if (!plugin.settings.keepLatexIntermediates) {
		cleanupIntermediates(workDir);
	}

	new Notice(`Exported to ${destPath}`);

	// Optional auto-open.
	if (plugin.settings.autoOpenPdf) {
		void shell.openPath(destPath);
	}
}
