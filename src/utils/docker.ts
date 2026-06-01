// Docker CLI wrapper and configuration.

import { execFile, spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

export const DOCKER_BIN = '/usr/local/bin/docker';
export const DOCKER_IMAGE_NAME = 'obsidian2pdf';

// Locate Docker binary by augmenting PATH with common installation locations.
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

// Check if the Docker image exists.
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

// Remove the Docker image.
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

// Delete build artifacts but preserve the build/ directory structure.
export function cleanupBuildFolder(pluginDir: string): number {
	const buildDir = join(pluginDir, 'pipeline', 'build');
	if (!existsSync(buildDir)) return 0;
	const entries = readdirSync(buildDir);
	for (const name of entries) {
		rmSync(join(buildDir, name), { recursive: true, force: true });
	}
	return entries.length;
}

// Remove per-document build directory and LaTeX intermediates after successful export.
export function cleanupIntermediates(workDir: string): void {
	rmSync(workDir, { recursive: true, force: true });
}

// Build Docker image; logs written to build/last-build.log.
export async function buildImage(pluginDir: string, noCache: boolean = false): Promise<void> {
	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');
	const logFile = join(buildDir, 'last-build.log');

	// Prepare build directory.
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

// Run the export pipeline for a given markdown file.
export async function runPipeline(
	pluginDir: string,
	vaultPath: string,
	mdRelPath: string,
): Promise<string> {
	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');
	const logFile = join(buildDir, 'last_latex_run.log');

	// Container output PDF is mapped from /build/<basename>/<basename>.pdf to <pluginDir>/pipeline/build/...
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
