// Chained status checks for the settings tab: CLI -> daemon -> image.

import { execFile, ExecException } from 'child_process';
import type { PreflightResults, PreflightCheckResult } from '../types';
import { DOCKER_IMAGE_NAME, getDockerBin, getDockerEnv, imageExists } from './docker';

function execFilePromise(cmd: string, args: string[], timeout = 5000): Promise<{ stdout: string }> {
	return new Promise((resolve, reject) => {
		const proc = execFile(
			cmd,
			args,
			{ timeout, windowsHide: true, env: getDockerEnv() },
			(err: ExecException | null, stdout: string) => {
				if (err) {
					reject(err);
					return;
				}
				resolve({ stdout });
			},
		);
		if (!proc) reject(new Error('Failed to spawn process'));
	});
}

// Checks form a dependency chain; a failed stage marks later stages as skipped
// so the UI can show "fix this first" instead of three unrelated errors.
export async function runPreflightChecks(): Promise<PreflightResults> {
	const checks: PreflightCheckResult[] = [];
	const bin = getDockerBin();

	let cliOk = false;
	try {
		const { stdout } = await execFilePromise(bin, ['--version'], 4000);
		cliOk = true;
		checks.push({ name: 'Docker CLI', passed: true, message: `${bin} — ${stdout.trim()}` });
	} catch {
		checks.push({
			name: 'Docker CLI',
			passed: false,
			message: `Not found: ${bin}. Set the Docker path below or use auto-detect.`,
		});
	}

	let daemonOk = false;
	if (!cliOk) {
		checks.push({ name: 'Daemon', passed: false, skipped: true, message: 'Skipped — CLI not found.' });
	} else {
		try {
			await execFilePromise(bin, ['info'], 5000);
			daemonOk = true;
			checks.push({ name: 'Daemon', passed: true, message: 'Docker daemon reachable.' });
		} catch {
			checks.push({ name: 'Daemon', passed: false, message: 'Daemon unreachable — start Docker and re-check.' });
		}
	}

	if (!daemonOk) {
		checks.push({ name: 'Image', passed: false, skipped: true, message: 'Skipped — daemon unreachable.' });
	} else if (await imageExists()) {
		checks.push({ name: 'Image', passed: true, message: `Image "${DOCKER_IMAGE_NAME}" is built.` });
	} else {
		checks.push({ name: 'Image', passed: false, message: `Image "${DOCKER_IMAGE_NAME}" not built yet — build below.` });
	}

	return {
		all_passed: checks.every((c) => c.passed),
		checks,
		timestamp: Date.now(),
	};
}
