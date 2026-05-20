// Docker-compose invocation wrapper and shared docker constants.

import { execFile, spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

export const DOCKER_BIN = '/usr/local/bin/docker';
export const DOCKER_IMAGE_NAME = 'obsidian2pdf';

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

// Remove the Docker image
// command: docker image rm -f DOCKER_IMAGE_NAME
export async function removeImage(): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		execFile(
			DOCKER_BIN,
			['image', 'rm', '-f', DOCKER_IMAGE_NAME],
			{ timeout: 30000, windowsHide: true, env: getDockerEnv() },
			(err: Error | null) => (err ? reject(err) : resolve()),
		);
	});
}

// Delete every entry inside pipeline/build/ (logs, per-doc folders, …) but
// keep the build/ folder itself so subsequent runs don't have to recreate it.
export function cleanupBuildFolder(pluginDir: string): number {
	const buildDir = join(pluginDir, 'pipeline', 'build');
	if (!existsSync(buildDir)) return 0;
	const entries = readdirSync(buildDir);
	for (const name of entries) {
		rmSync(join(buildDir, name), { recursive: true, force: true });
	}
	return entries.length;
}

// Drop the per-doc build dir entirely. Called after a successful export when
// "Keep LaTeX intermediates" is off — the PDF is already copied to the user's
// destination, so the work dir has nothing worth keeping.
export function cleanupIntermediates(workDir: string): void {
	rmSync(workDir, { recursive: true, force: true });
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
