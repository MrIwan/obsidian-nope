import { App } from 'obsidian';
import type { PreflightResults, PreflightCheckResult } from '../types';
import { DOCKER_BIN, DOCKER_IMAGE_NAME } from './docker';

function execFilePromise(cmd: string, args: string[], timeout = 5000): Promise<{ stdout: string }>
{
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const child_process = require('child_process');
	const { execFile } = child_process as typeof import('child_process');

	return new Promise((resolve, reject) => {
		const proc = execFile(cmd, args, { timeout, windowsHide: true, env: process.env }, (err: any, stdout: string) => {
			if (err) return reject(err);
			resolve({ stdout });
		});

		// in case the process is nullish
		if (!proc) reject(new Error('Failed to spawn process'));
	});
}

export async function runPreflightChecks(_app: App): Promise<PreflightResults> {
	const checks: PreflightCheckResult[] = [];

	// Docker CLI
	try {
		const { stdout } = await execFilePromise(DOCKER_BIN, ['--version'], 4000);
		checks.push({ name: 'Docker CLI installed', passed: true, message: stdout.trim() });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		checks.push({ name: 'Docker CLI installed', passed: false, message: `${DOCKER_BIN}: ${msg}` });
	}

	// Docker daemon
	try {
		await execFilePromise(DOCKER_BIN, ['info'], 5000);
		checks.push({ name: 'Docker daemon running', passed: true, message: 'Docker daemon reachable' });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		checks.push({ name: 'Docker daemon running', passed: false, message: `Daemon unreachable: ${msg}` });
	}

	// Docker image
	try {
		await execFilePromise(DOCKER_BIN, ['image', 'inspect', DOCKER_IMAGE_NAME], 5000);
		checks.push({ name: `Docker image "${DOCKER_IMAGE_NAME}" exists`, passed: true, message: `Image ${DOCKER_IMAGE_NAME} found` });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		checks.push({ name: `Docker image "${DOCKER_IMAGE_NAME}" exists`, passed: false, message: `Image not found: ${msg}` });
	}

	return {
		all_passed: checks.every((c) => c.passed),
		checks,
		timestamp: Date.now(),
	};
}

export {};
