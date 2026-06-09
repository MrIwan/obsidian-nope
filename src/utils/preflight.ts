import { App } from 'obsidian';
import { execFile, ExecException } from 'child_process';
import type { PreflightResults, PreflightCheckResult } from '../types';
import { DOCKER_BIN, getDockerEnv } from './docker';

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

		// in case the process is nullish
		if (!proc) reject(new Error('Failed to spawn process'));
	});
}

export async function runPreflightChecks(_app: App): Promise<PreflightResults> {
	const checks: PreflightCheckResult[] = [];
	const dockerBin = DOCKER_BIN;

	// Docker CLI
	try {
		const { stdout } = await execFilePromise(dockerBin, ['--version'], 4000);
		checks.push({ name: 'Docker CLI installed', passed: true, message: `${dockerBin}: ${stdout.trim()}` });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		checks.push({ name: 'Docker CLI installed', passed: false, message: `${dockerBin}: ${msg}` });
	}

	// Docker daemon
	try {
		await execFilePromise(dockerBin, ['info'], 5000);
		checks.push({ name: 'Docker daemon running', passed: true, message: 'Docker daemon reachable' });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		checks.push({ name: 'Docker daemon running', passed: false, message: `Daemon unreachable: ${msg}` });
	}

	return {
		all_passed: checks.every((c) => c.passed),
		checks,
		timestamp: Date.now(),
	};
}

export {};
