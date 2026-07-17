/** Progress reporting: a persistent updatable notice, pipeline phase parsing and per-phase timing. */

import { Notice } from 'obsidian';
import { appendFileSync, existsSync } from 'fs';
import { join } from 'path';

/** A persistent Notice whose message updates in place, then is replaced by an auto-hiding success or failure message. */
export class ProgressNotice {
	private notice: Notice;
	private span!: HTMLSpanElement;
	private lastMessage = '';

	constructor(message: string) {
		this.notice = this.createNotice(message);
		this.lastMessage = message;
	}

	// Render the message into an own <span> so we can update the text in place and detect whether the notice was dismissed
	private createNotice(message: string): Notice {
		const frag = createFragment();
		this.span = frag.createSpan({ text: message });
		return new Notice(frag, 0);
	}

	// Update the visible message
	update(message: string): void {
		if (message === this.lastMessage && this.span.isConnected) return;
		this.lastMessage = message;
		if (this.span.isConnected) {
			this.span.textContent = message;
		} else {
			this.notice = this.createNotice(message);
		}
	}

	// Replace the persistent notice with an auto-hiding success message.
	succeed(message: string, timeoutMs = 6000): void {
		this.notice.hide();
		new Notice(message, timeoutMs);
	}

	// Replace the persistent notice with an auto-hiding failure message.
	fail(message: string, timeoutMs = 10000): void {
		this.notice.hide();
		new Notice(message, timeoutMs);
	}
}

/** Map a chunk of pipeline output to a short human-readable phase label. */
export function parsePipelinePhase(chunk: string): string | null {
	let phase: string | null = null;
	for (const line of chunk.split('\n')) {
		if (line.includes('>>> Prepare:')) phase = 'resolving vault references';
		else if (line.includes('>>> Custom template')) phase = 'applying custom template';
		else if (line.includes('>>> Branding override')) phase = 'applying branding';
		else if (line.includes('>>> Bibliography')) phase = 'preparing bibliography';
		else if (line.includes('>>> Installing LaTeX packages')) phase = 'installing LaTeX packages';
		else if (line.includes('>>> Pandoc:')) phase = 'Pandoc → LaTeX';
		else if (line.includes('mermaid chart')) phase = 'rendering mermaid diagrams';
		else if (line.includes('>>> latexmk')) phase = 'compiling PDF (latexmk)';
		else if (line.includes('makeglossaries')) phase = 'building glossary';
		else {
			const run = line.match(/Run number (\d+) of rule '([^']+)'/);
			if (run) phase = `compiling PDF (${run[2]}, pass ${run[1]})`;
			else if (line.includes('>>> Done')) phase = 'finishing up';
		}
	}
	return phase;
}

/** Parse ">>> NOPE-TIMING <label> <ms>" lines from build.sh into per-phase durations. */
export function parsePipelineTimings(chunk: string): { label: string; ms: number }[] {
	const out: { label: string; ms: number }[] = [];
	for (const line of chunk.split('\n')) {
		const m = line.match(/NOPE-TIMING (\S+) (\d+)ms/);
		if (m) {
			const label = m[1] ?? '';
			if (label) out.push({ label, ms: parseInt(m[2] ?? '0', 10) });
		}
	}
	return out;
}

/** Collect per-phase durations across one export and format a compact one-line summary. */
export class PhaseTimer {
	private readonly start = Date.now();
	private last = this.start;
	private readonly marks: { label: string; ms: number }[] = [];

	// Record the time elapsed since the previous lap (or start) under `label`.
	lap(label: string): void {
		const now = Date.now();
		this.marks.push({ label, ms: now - this.last });
		this.last = now;
	}

	// Record an externally measured duration (e.g. parsed from the container output).
	add(label: string, ms: number): void {
		this.marks.push({ label, ms });
	}

	totalMs(): number {
		return Date.now() - this.start;
	}

	// Snapshot of the recorded phase durations plus the running total (for logging).
	snapshot(): { marks: { label: string; ms: number }[]; totalMs: number } {
		return { marks: [...this.marks], totalMs: this.totalMs() };
	}

	// e.g. "bases 1.4s · pandoc 1.1s · latexmk 7.0s · overhead 2.1s · total 12.0s" (phases < 50ms hidden).
	format(): string {
		const fmt = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
		const parts = this.marks.filter((m) => m.ms >= 50).map((m) => `${m.label} ${fmt(m.ms)}`);
		parts.push(`total ${fmt(this.totalMs())}`);
		return parts.join(' · ');
	}
}

// Canonical phase order so timer.csv keeps a stable column layout across runs.
const TIMER_CSV_PHASES = [
	'assets',
	'docker',
	'bases',
	'prepare',
	'pandoc',
	'latexmk',
	'overhead',
] as const;

/** Append one row of per-phase timings to <buildDir>/timer.csv, writing the header on first use. */
export function appendTimerCsv(buildDir: string, document: string, timer: PhaseTimer): void {
	const { marks, totalMs } = timer.snapshot();
	const byLabel = new Map(marks.map((m) => [m.label, m.ms]));
	const csvFile = join(buildDir, 'timer.csv');
	const escape = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

	const lines: string[] = [];
	if (!existsSync(csvFile)) {
		lines.push(['timestamp', 'document', ...TIMER_CSV_PHASES, 'total'].join(','));
	}
	lines.push(
		[
			new Date().toISOString(),
			escape(document),
			...TIMER_CSV_PHASES.map((p) => String(byLabel.get(p) ?? '')),
			String(totalMs),
		].join(','),
	);
	appendFileSync(csvFile, lines.join('\n') + '\n');
}

/** Map docker BuildKit output to a short build-step label. */
export function parseBuildStep(chunk: string): string | null {
	let step: string | null = null;
	for (const line of chunk.split('\n')) {
		const m = line.match(/^#\d+ \[(\d+)\/(\d+)\] (.{0,60})/);
		if (m) step = `step ${m[1]}/${m[2]}: ${(m[3] ?? '').trim()}`;
		else if (line.startsWith('#') && line.includes('exporting to image')) step = 'exporting image';
		else if (line.includes('load metadata for')) step = 'resolving base image';
	}
	return step;
}
