// Docker-compose invocation wrapper and shared docker constants.

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export const DOCKER_BIN = '/usr/local/bin/docker';
export const DOCKER_IMAGE_NAME = 'obsidian2pdf:latest';

// Check for the Docker binary
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

// Check if the Docker image exists
// command: docker image inspect obsidian2pdf:latest
export async function imageExists(): Promise<boolean> {
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

// building the image, can take a while
// logging to build/last-build.log for debugging and user feedback on failures
export async function buildImage(pluginDir: string): Promise<void> {
	const child_process = require('child_process');
	const { spawn } = child_process as typeof import('child_process');

	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');
	const logFile = join(buildDir, 'last-build.log');

	// Prepare the build dir. If this fails the plugin is in a broken state
	// (wrong plugin path, read-only filesystem, disk full) — let it crash.
	mkdirSync(buildDir, { recursive: true });

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
			writeFileSync(logFile, `Failed to spawn process: ${err.message}\n\n${output}`);
			reject(err);
		});

		proc.on('close', (code: number | null) => {
			writeFileSync(logFile, output);
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
