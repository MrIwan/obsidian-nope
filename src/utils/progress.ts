// Persistent, updatable notice

import { Notice } from 'obsidian';

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
		const frag = activeDocument.createDocumentFragment();
		this.span = activeDocument.createElement('span');
		this.span.textContent = message;
		frag.append(this.span);
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

// Map a chunk of pipeline output (build.sh / pandoc / latexmk) to a short human-readable phase label
export function parsePipelinePhase(chunk: string): string | null {
	let phase: string | null = null;
	for (const line of chunk.split('\n')) {
		if (line.includes('>>> Branding override')) phase = 'applying branding';
		else if (line.includes('>>> Bibliography')) phase = 'preparing bibliography';
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

// Map docker BuildKit output to a short build-step label ("step 5/6: tlmgr …").
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
