// Docker-compose invocation wrapper and shared docker constants.
//
// PATH-Note: GUI-launched apps on macOS inherit a minimal PATH that usually
// does not include /usr/local/bin or /opt/homebrew/bin. As a pragmatic first
// step we hardcode the absolute path here. Robust PATH discovery (look in
// known locations, optionally `bash -lc which docker`) is a later iteration.

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export const DOCKER_BIN = '/usr/local/bin/docker';
export const DOCKER_IMAGE_NAME = 'obsidian2pdf:latest';

/**
 * Returns a process env with PATH extended to include common locations for
 * the docker binary and its credential helpers. macOS GUI apps inherit a
 * minimal PATH that typically omits /usr/local/bin, /opt/homebrew/bin and
 * Docker Desktop's bundled binaries (which includes docker-credential-desktop,
 * needed for any image pull when credsStore=desktop is configured).
 */
export function getDockerEnv(): NodeJS.ProcessEnv {
	const extraPaths = [
		'/usr/local/bin',
		'/opt/homebrew/bin',
		'/Applications/Docker.app/Contents/Resources/bin',
	];
	const existingPath = process.env.PATH ?? '';
	const newPath = [...extraPaths, existingPath].filter(Boolean).join(':');
	return { ...process.env, PATH: newPath };
}

/**
 * Checks whether the pipeline Docker image is present on the host.
 * Returns false on any error (image not built, daemon unreachable, etc.).
 */
export async function imageExists(): Promise<boolean> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const child_process = require('child_process');
	const { execFile } = child_process as typeof import('child_process');

	return new Promise<boolean>((resolve) => {
		const proc = execFile(
			DOCKER_BIN,
			['image', 'inspect', DOCKER_IMAGE_NAME],
			{ timeout: 5000, windowsHide: true, env: getDockerEnv() },
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(err: any) => {
				resolve(!err);
			},
		);
		if (!proc) resolve(false);
	});
}

/**
 * Builds the pipeline image by running `docker compose build` with cwd set
 * to <pluginDir>/pipeline. No timeout — first-time builds can take 5–15
 * minutes. stdout + stderr are aggregated and written to
 * <pluginDir>/pipeline/build/last-build.log regardless of success/failure.
 *
 * Resolves on exit code 0. Rejects with an Error containing the exit code
 * and a hint to the log file otherwise.
 */
export async function buildImage(pluginDir: string): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const child_process = require('child_process');
	const { spawn } = child_process as typeof import('child_process');

	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');
	const logFile = join(buildDir, 'last-build.log');

	// Make sure the build dir exists so we can write the log even on failure.
	try {
		mkdirSync(buildDir, { recursive: true });
	} catch {
		// non-fatal — if we can't create the dir, the writeFile below will fail
		// and we'll just lose the log. Build itself still proceeds.
	}

	return new Promise<void>((resolve, reject) => {
		let output = '';
		const proc = spawn(DOCKER_BIN, ['compose', 'build'], {
			cwd: pipelineDir,
			env: getDockerEnv(),
			windowsHide: true,
		});

		proc.stdout?.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		proc.stderr?.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});

		proc.on('error', (err: Error) => {
			try {
				writeFileSync(logFile, `Failed to spawn process: ${err.message}\n\n${output}`);
			} catch {
				// ignore log-write errors
			}
			reject(err);
		});

		proc.on('close', (code: number | null) => {
			try {
				writeFileSync(logFile, output);
			} catch {
				// ignore log-write errors
			}
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(`docker compose build exited with code ${code}. See log: ${logFile}`),
				);
			}
		});
	});
}
