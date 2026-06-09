// Extract bundled pipeline/ + skill/ files to disk.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { BUNDLED_ASSETS } from '../generated/bundled-assets';

const VERSION_MARKER = '.bundled-assets-version';

// Write bundled assets into pluginDir unless they are already current for this
// plugin version. Idempotent: a no-op once the marker matches `version`.
export function ensureBundledAssets(pluginDir: string, version: string): void {
	const markerPath = join(pluginDir, VERSION_MARKER);

	if (existsSync(markerPath)) {
		try {
			if (readFileSync(markerPath, 'utf8').trim() === version) return;
		} catch {
			// Unreadable marker: fall through and re-extract.
		}
	}

	for (const [relPath, base64] of Object.entries(BUNDLED_ASSETS)) {
		const dest = join(pluginDir, relPath);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, Buffer.from(base64, 'base64'));
	}

	writeFileSync(markerPath, version);
}
