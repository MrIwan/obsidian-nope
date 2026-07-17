/**
 * The reusable export pipeline, shared by the export command and the preview view.
 * Orchestrates asset extraction, Docker readiness, the optional image build, the
 * container prepare step and the pipeline run, then copies out the PDF.
 */

import { Notice, TFile, normalizePath } from 'obsidian';
import { shell } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, relative, sep } from 'path';
import type NopePlugin from '../main';
import { buildImage, checkDockerReady, cleanupIntermediates, imageStatus, runPipeline } from './docker';
import { getPluginAbsoluteDir, getVaultAbsolutePath, resolveOutputPath } from './paths';
import { PhaseTimer, appendTimerCsv, parseBuildStep, parsePipelinePhase, parsePipelineTimings } from './progress';
import { prepareBases } from './bases';
import { ensureBundledAssets } from './assets';

/** Minimal progress surface. ProgressNotice satisfies it, the preview view brings its own. */
export interface ProgressReporter {
	update(message: string): void;
	succeed(message: string): void;
	fail(message: string): void;
}

/** Options for a single export run. */
export interface ExportOptions {
	reporter: ProgressReporter;
	/** Overrides settings.keepLatexIntermediates when set. */
	keepIntermediates?: boolean;
	/** Copy the PDF to the configured output path (default true). */
	copyToDestination?: boolean;
	/** Overrides settings.autoOpenPdf when set. */
	openPdf?: boolean;
}

/** Result of an export run: paths and dependency list on success. */
export type ExportResult =
	| { ok: true; pdfPath: string; destPath: string | null; workDir: string; deps: string[] }
	| { ok: false; deps?: string[] };

/**
 * Run one export end to end for the given note.
 * @returns the PDF path, destination and dependency list on success, ok:false otherwise
 */
export async function runExport(plugin: NopePlugin, file: TFile, opts: ExportOptions): Promise<ExportResult> {
	const { reporter } = opts;
	const copyToDestination = opts.copyToDestination ?? true;
	const keepIntermediates = opts.keepIntermediates ?? plugin.settings.keepLatexIntermediates;
	const openPdf = opts.openPdf ?? plugin.settings.autoOpenPdf;

	const pluginDir = getPluginAbsoluteDir(plugin);
	const vaultPath = getVaultAbsolutePath(plugin.app);

	// Per-phase timer; surfaced as a one-line summary in the success notice.
	const timer = new PhaseTimer();

	// Ensure the bundled pipeline/ + skill/ are present
	try {
		ensureBundledAssets(pluginDir, plugin.manifest.version);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Pipeline files missing and could not be created. ${msg}`);
		return { ok: false };
	}
	timer.lap('assets');

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
	timer.lap('docker');

	// Resolve source and destination paths.
	const sourceAbs = join(vaultPath, file.path);
	const destPath = resolveOutputPath(plugin.settings.outputPath, sourceAbs, vaultPath);

	// Create per-document build directory.
	const baseName = file.basename;
	const workDir = join(pluginDir, 'pipeline', 'build', baseName);
	mkdirSync(workDir, { recursive: true });

	// Branding, bibliography, citation notes and custom templates are resolved
	// inside the container (nope-prepare.lua); only Bases need the Obsidian API.

	// Resolve embedded Bases and materialize shadows for the transclude filter.
	let baseDeps: string[] = [];
	try {
		baseDeps = await prepareBases(plugin.app, file, workDir);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Bases export failed. ${msg}`);
		return { ok: false };
	}
	timer.lap('bases');

	// Run export pipeline
	let producedPdf: string;
	let strippedChars = 0;
	// prepare/pandoc/latexmk durations come from build.sh's ">>> NOPE-TIMING" lines; overhead is the rest.
	let prepareMs = 0;
	let pandocMs = 0;
	let latexmkMs = 0;
	// Structured markers from nope-prepare.lua: errors abort the run, warnings become notices.
	const pipelineErrors: string[] = [];
	const pipelineWarnings: string[] = [];
	const pipelineStart = Date.now();
	const collectMarkers = (chunk: string): void => {
		for (const line of chunk.split('\n')) {
			const err = /^>>> NOPE-ERROR: (.+)$/.exec(line);
			if (err?.[1]) pipelineErrors.push(err[1]);
			const wrn = /^>>> NOPE-WARN (.+)$/.exec(line);
			if (wrn?.[1]) pipelineWarnings.push(wrn[1]);
		}
	};
	try {
		producedPdf = await runPipeline(pluginDir, vaultPath, file.path, (chunk) => {
			collectMarkers(chunk);
			const phase = parsePipelinePhase(chunk);
			if (phase) reporter.update(`Exporting "${file.basename}" — ${phase}`);
			for (const t of parsePipelineTimings(chunk)) {
				if (t.label === 'prepare') prepareMs = t.ms;
				else if (t.label === 'pandoc') pandocMs = t.ms;
				else if (t.label === 'latexmk') latexmkMs = t.ms;
			}
			// strip-unsupported.lua reports removed emoji/pictograph chars.
			const m = /NOPE-STRIPPED (\d+)/.exec(chunk);
			if (m) strippedChars = parseInt(m[1] ?? '0', 10);
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		reporter.fail(`Export failed. ${pipelineErrors.length > 0 ? pipelineErrors.join(' ') : msg}`);
		// build.sh re-seeds the manifest before pandoc runs, so it is fresh even on LaTeX failure.
		return { ok: false, deps: [...new Set([...readDepsManifest(workDir, file.path), ...baseDeps])] };
	}
	timer.add('prepare', prepareMs);
	timer.add('pandoc', pandocMs);
	timer.add('latexmk', latexmkMs);
	// Container startup + mount overhead: the pipeline wall time not spent in prepare, pandoc or latexmk.
	timer.add('overhead', Math.max(0, Date.now() - pipelineStart - prepareMs - pandocMs - latexmkMs));

	for (const warning of pipelineWarnings) {
		new Notice(warning, 12000);
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

	try {
		appendTimerCsv(join(pluginDir, 'pipeline', 'build'), baseName, timer);
	} catch {
		// never fail because of logging 
	}

	const outcome = finalDest ? `Exported to ${finalDest}` : `Rendered "${file.basename}"`;
	reporter.succeed(`${outcome} · ${timer.format()}`);

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
