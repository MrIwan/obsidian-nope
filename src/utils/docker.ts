// Docker-compose invocation wrapper and shared docker constants.

import { execFile, spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export const DOCKER_BIN = '/usr/local/bin/docker';
export const DOCKER_IMAGE_NAME = 'obsidian2pdf:latest';

// Check for the Docker binary ( ony tested on macOS )
export function getDockerEnv(): typeof process.env {
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
// command: docker image inspect DOCKER_IMAGE_NAME
export async function imageExists(): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const proc = execFile(
			DOCKER_BIN,
			['image', 'inspect', DOCKER_IMAGE_NAME],
			{ timeout: 5000, windowsHide: true, env: getDockerEnv() },
			(err) => {
				resolve(!err);
			},
		);
		if (!proc) resolve(false);
	});
}

// building the image, can take a while
// command: docker compose build --no-cache
// logging to build/last-build.log for debugging and user feedback on failures
export async function buildImage(pluginDir: string, noCache: boolean = false): Promise<void> {
	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');
	const logFile = join(buildDir, 'last-build.log');

	// Prepare the build dir.
	mkdirSync(buildDir, { recursive: true });

	return new Promise<void>((resolve, reject) => {
		let output = '';
		const proc = spawn(DOCKER_BIN, ['compose', 'build', noCache ? '--no-cache' : undefined].filter(Boolean) as string[], {
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

// Runs the pipeline
// command: docker compose run --rm pipeline <mdRelPath>
export async function runPipeline(
	pluginDir: string,
	vaultPath: string,
	mdRelPath: string,
): Promise<string> {
	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');
	const logFile = join(buildDir, 'last_latex_run.log');

	// Pipeline writes its output PDF to /build/<basename>/<basename>.pdf inside the container, which maps to <pluginDir>/pipeline/build/... on host.
	const baseName = mdRelPath
		.split('/')
		.pop()!
		.replace(/\.md$/i, '');
	const pdfPath = join(buildDir, baseName, `${baseName}.pdf`);

	mkdirSync(buildDir, { recursive: true });

	return new Promise<string>((resolve, reject) => {
		let output = '';
		const proc = spawn(DOCKER_BIN, ['compose', 'run', '--rm', 'pipeline', mdRelPath], {
			cwd: pipelineDir,
			env: { ...getDockerEnv(), VAULT_PATH: vaultPath },
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
				resolve(pdfPath);
			} else {
				reject(
					new Error(`docker compose run exited with code ${code}. See log: ${logFile}`),
				);
			}
		});
	});
}
