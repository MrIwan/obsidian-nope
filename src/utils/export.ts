// Reusable export pipeline shared by the export command and the (future) preview view.

import { Notice, TFile, normalizePath } from 'obsidian';
import { shell } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, relative, sep } from 'path';
import type NopePlugin from '../main';
import { buildImage, checkDockerReady, cleanupIntermediates, imageStatus, runPipeline } from './docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath, resolveOutputPath } from './paths';
import { parseBuildStep, parsePipelinePhase } from './progress';
import { prepareBrandingOverride } from './branding';
import { prepareBibliography } from './bibliography';
import { prepareTemplate } from './template';
import { prepareBases } from './bases';
import { ensureBundledAssets } from './assets';

// Minimal progress surface; ProgressNotice satisfies it, the preview view brings its own.
export interface ProgressReporter {
	update(message: string): void;
	succeed(message: string): void;
	fail(message: string): void;
}

export interface ExportOptions {
	reporter: ProgressReporter;
	/** Overrides settings.keepLatexIntermediates when set. */
	keepIntermediates?: boolean;
	/** Copy the PDF to the configured output path (default true). */
	copyToDestination?: boolean;
	/** Overrides settings.autoOpenPdf when set. */
	openPdf?: boolean;
}

export type ExportResult =
	| { ok: true; pdfPath: string; destPath: string | null; workDir: string; deps: string[] }
	| { ok: false; deps?: string[] };

export async function runExport(plugin: NopePlugin, file: TFile, opts: ExportOptions): Promise<ExportResult> {
	const { reporter } = opts;
	const copyToDestination = opts.copyToDestination ?? true;
	const keepIntermediates = opts.keepIntermediates ?? plugin.settings.keepLatexIntermediates;
	const openPdf = opts.openPdf ?? plugin.settings.autoOpenPdf;

	const pluginDir = getPluginAbsoluteDir(plugin);
	const vaultPath = getVaultAbsolutePath(plugin.app);

	// Ensure the bundled pipeline/ + skill/ are present
	try {
		ensureBundledAssets(pluginDir, plugin.manifest.version);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Pipeline files missing and could not be created. ${msg}`);
		return { ok: false };
	}

	// Verify Docker is ready
	const dockerReady = await checkDockerReady();
	if (!dockerReady.ok) {
		reporter.fail(dockerReady.message);
		return { ok: false };
	}

	// Image must be present AND built from the current Dockerfile (rebuild after updates).
	const status = await imageStatus(pluginDir);
	if (status !== 'current') {
		const firstRun = status === 'missing';
		reporter.update(
			firstRun
				? 'Docker image not found — building it now (first run, 5–15 min)…'
				: 'Pipeline updated — rebuilding the Docker image…',
		);
		try {
			await buildImage(pluginDir, false, (chunk) => {
				const step = parseBuildStep(chunk);
				if (step) {
					reporter.update(`${firstRun ? 'Building' : 'Rebuilding'} Docker image — ${step}`);
				}
			});
			reporter.update(`Docker image ready — exporting "${file.basename}"…`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			reporter.fail(`Failed to build Docker image. Try to build in the plugin settings. ${msg}`);
			return { ok: false };
		}
	}

	// Resolve source and destination paths.
	const sourceAbs = join(vaultPath, file.path);
	const destPath = resolveOutputPath(plugin.settings.outputPath, sourceAbs, vaultPath);

	// Create per-document build directory.
	const baseName = file.basename;
	const workDir = join(pluginDir, 'pipeline', 'build', baseName);
	mkdirSync(workDir, { recursive: true });

	// Materialize branding overrides; fail loudly if branding file cannot be resolved.
	try {
		prepareBrandingOverride(
			plugin.app,
			file,
			workDir,
			vaultPath,
			baseName,
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Branding override failed. ${msg}`);
		return { ok: false };
	}

	// Materialize bibliography; copy to work directory with fixed filenames for build.sh.
	try {
		prepareBibliography(
			plugin.app,
			file,
			workDir,
			vaultPath,
			pluginDir,
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Bibliography prep failed. ${msg}`);
		return { ok: false };
	}

	// Materialize a custom template if selected
	try {
		const tpl = prepareTemplate(plugin.app, file, workDir, vaultPath);
		if (tpl.name) {
			// Status goes into the progress notice; only the warning needs its own toast.
			reporter.update(`Using custom template "${tpl.name}"…`);
			if (tpl.missingPreamble) {
				new Notice(
					`Template "${tpl.name}" is missing the NOPE-IMPORTS block — ` +
						`tables, callouts, theorems and the glossary may break. ` +
						`Copy nope_minimal.tex as a starting point.`,
					12000,
				);
			}
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Template prep failed. ${msg}`);
		return { ok: false };
	}

	// Resolve embedded Bases and materialize shadows for the transclude filter.
	let baseDeps: string[] = [];
	try {
		baseDeps = await prepareBases(plugin.app, file, workDir);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Bases export failed. ${msg}`);
		return { ok: false };
	}

	// Run export pipeline
	let producedPdf: string;
	let strippedChars = 0;
	try {
		producedPdf = await runPipeline(pluginDir, vaultPath, file.path, (chunk) => {
			const phase = parsePipelinePhase(chunk);
			if (phase) reporter.update(`Exporting "${file.basename}" — ${phase}`);
			// strip-unsupported.lua reports removed emoji/pictograph chars.
			const m = /NOPE-STRIPPED (\d+)/.exec(chunk);
			if (m) strippedChars = parseInt(m[1] ?? '0', 10);
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Export failed. ${msg}`);
		// build.sh re-seeds the manifest before pandoc runs, so it is fresh even on LaTeX failure.
		return { ok: false, deps: [...new Set([...readDepsManifest(workDir, file.path), ...baseDeps])] };
	}

	// Read the dependency manifest before any cleanup can remove it.
	const deps = [...new Set([...readDepsManifest(workDir, file.path), ...baseDeps])];

	if (strippedChars > 0) {
		new Notice(
			`Removed ${strippedChars} unsupported character(s) (e.g. emoji) — ` +
				`the pdflatex engine can't render them, so they were dropped from the PDF.`,
			10000,
		);
	}

	// Copy PDF to destination.
	let finalDest: string | null = null;
	if (copyToDestination) {
		try {
			const vaultRelPath = relative(vaultPath, destPath);
			if (vaultRelPath.startsWith('..') || isAbsolute(vaultRelPath)) {
				// Destination outside the vault: plain filesystem copy.
				mkdirSync(dirname(destPath), { recursive: true });
				copyFileSync(producedPdf, destPath);
			} else {
				const data = readFileSync(producedPdf);
				const adapterPath = normalizePath(vaultRelPath.split(sep).join('/'));
				const parentDir = adapterPath.includes('/')
					? adapterPath.slice(0, adapterPath.lastIndexOf('/'))
					: '';
				if (parentDir) {
					await plugin.app.vault.adapter.mkdir(parentDir);
				}
				const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
				await plugin.app.vault.adapter.writeBinary(adapterPath, buf);
			}
			finalDest = destPath;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			reporter.fail(`Export failed while copying the PDF. Build folder kept for inspection. ${msg}`);
			return { ok: false };
		}
	}

	// Cleanup build artifacts unless intermediates are kept.
	if (!keepIntermediates) {
		cleanupIntermediates(workDir);
	}

	reporter.succeed(finalDest ? `Exported to ${finalDest}` : `Rendered "${file.basename}"`);

	if (openPdf && finalDest) {
		void shell.openPath(finalDest);
	}

	return { ok: true, pdfPath: producedPdf, destPath: finalDest, workDir, deps };
}

// Parse $WORK/deps.txt (container paths) into vault-relative paths; root file always included.
function readDepsManifest(workDir: string, rootPath: string): string[] {
	const seen = new Set<string>([normalizePath(rootPath)]);
	const manifest = join(workDir, 'deps.txt');
	if (existsSync(manifest)) {
		for (const line of readFileSync(manifest, 'utf8').split('\n')) {
			const trimmed = line.trim();
			// Only vault files matter for the watcher; /app assets cannot change at runtime.
			if (trimmed.startsWith('/vault/')) {
				seen.add(normalizePath(trimmed.slice('/vault/'.length)));
			}
		}
	}
	return [...seen];
}
