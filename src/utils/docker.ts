// Docker CLI wrapper and configuration.

import { execFile, spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { delimiter, join } from 'path';

export const DOCKER_IMAGE_NAME = 'nope';
// Label carrying the Dockerfile hash the image was built from (freshness check).
export const IMAGE_HASH_LABEL = 'nope.image-hash';
function dockerSearchDirs(): string[] {
	switch (process.platform) {
		case 'win32':
			return [
				'C:\\Program Files\\Docker\\Docker\\resources\\bin',
				'C:\\ProgramData\\DockerDesktop\\version-bin',
			];
		case 'linux':
			return ['/usr/bin', '/usr/local/bin', '/snap/bin'];
		default:
			return [
				'/usr/local/bin',
				'/opt/homebrew/bin',
				'/Applications/Docker.app/Contents/Resources/bin',
			];
	}
}

// Augment PATH so a bare `docker` and our candidate dirs resolve in Electron.
export function getDockerEnv(): typeof process.env {
	const existingPath = process.env.PATH ?? '';
	const newPath = [...dockerSearchDirs(), existingPath].filter(Boolean).join(delimiter);
	return { ...process.env, PATH: newPath };
}

// Bare binary name; used as PATH fallback when no candidate or override matches.
export const DOCKER_BIN = process.platform === 'win32' ? 'docker.exe' : 'docker';

// User-configured docker path; set from settings on load and on change.
let dockerPathOverride = '';

export function setDockerPathOverride(path: string): void {
	dockerPathOverride = path.trim();
}

// Prebuilt image published by CI on tag pushes (docker-image.yml).
export const PREBUILT_IMAGE_REPO = 'ghcr.io/mriwan/nope-pipeline';

// Prebuilt mode pulls from GHCR via Dockerfile.pull; off = full local build.
let usePrebuiltImage = true;

export function setUsePrebuiltImage(value: boolean): void {
	usePrebuiltImage = value;
}

// Empty = image tag matching the plugin version; set to pull e.g. a test-* tag.
let imageTagOverride = '';

export function setImageTagOverride(value: string): void {
	imageTagOverride = value.trim();
}

// Plugin version from the manifest; default tag for the prebuilt image.
let pluginVersion = '';

export function setPluginVersion(value: string): void {
	pluginVersion = value;
}

export function prebuiltImageTag(): string {
	return imageTagOverride || pluginVersion;
}

// First existing candidate from the search dirs, or null if none exists.
export function detectDockerBin(): string | null {
	for (const dir of dockerSearchDirs()) {
		const candidate = join(dir, DOCKER_BIN);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

// Resolution order: explicit override -> detected candidate -> bare name via PATH.
// Resolved per call so install changes between runs are picked up.
export function getDockerBin(): string {
	if (dockerPathOverride) return dockerPathOverride;
	return detectDockerBin() ?? DOCKER_BIN;
}

export type DockerReadiness = { ok: true } | { ok: false; message: string };

// Run a docker subcommand and report success/failure (no output captured).
function tryDocker(args: string[], timeout: number): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(getDockerBin(), args, { timeout, windowsHide: true, env: getDockerEnv() }, (err) =>
			resolve(!err),
		);
	});
}

// Verify Docker is usable before building/running
export async function checkDockerReady(): Promise<DockerReadiness> {
	if (!(await tryDocker(['--version'], 4000))) {
		return {
			ok: false,
			message:
				'Docker CLI not found. Install Docker, or set the Docker path in the plugin settings (auto-detect available).',
		};
	}
	if (!(await tryDocker(['info'], 6000))) {
		return {
			ok: false,
			message: 'Docker is installed but the daemon is not running. Start Docker Desktop and retry.',
		};
	}
	return { ok: true };
}

// Check if the Docker image exists.
export async function imageExists(): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const proc = execFile(
			getDockerBin(),
			['image', 'inspect', DOCKER_IMAGE_NAME],
			{ timeout: 5000, windowsHide: true, env: getDockerEnv() },
			(err) => {
				resolve(!err);
			},
		);
		if (!proc) resolve(false);
	});
}

// Short hash of the image-relevant inputs — a change makes the image stale and triggers a rebuild.
// Prebuilt mode: registry tag; local build: Dockerfile content.
export function pipelineImageHash(pluginDir: string): string {
	try {
		const source: string | Uint8Array = usePrebuiltImage
			? `pull:${PREBUILT_IMAGE_REPO}:${prebuiltImageTag()}`
			: readFileSync(join(pluginDir, 'pipeline', 'Dockerfile'));
		return createHash('sha256').update(source).digest('hex').slice(0, 12);
	} catch {
		return '';
	}
}

// Hash the existing image was built from (its label), or null if no image at all.
function builtImageHash(): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(
			getDockerBin(),
			[
				'image',
				'inspect',
				DOCKER_IMAGE_NAME,
				'--format',
				`{{ index .Config.Labels "${IMAGE_HASH_LABEL}" }}`,
			],
			{ timeout: 5000, windowsHide: true, env: getDockerEnv() },
			(err, stdout) => resolve(err ? null : stdout.trim()),
		);
	});
}

export type ImageStatus = 'missing' | 'stale' | 'current';

// Present and built from the current Dockerfile? 'stale' also covers pre-label images.
export async function imageStatus(pluginDir: string): Promise<ImageStatus> {
	const built = await builtImageHash();
	if (built === null) return 'missing';
	return built === pipelineImageHash(pluginDir) ? 'current' : 'stale';
}

// Remove the Docker image.
export async function removeImage(): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		execFile(
			getDockerBin(),
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
// `onOutput` receives every stdout/stderr chunk for live progress reporting.
export async function buildImage(
	pluginDir: string,
	noCache: boolean = false,
	onOutput?: (chunk: string) => void,
): Promise<void> {
	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');
	const logFile = join(buildDir, 'last-build.log');

	// Prepare build directory.
	mkdirSync(buildDir, { recursive: true });

	const ready = await checkDockerReady();
	if (!ready.ok) throw new Error(ready.message);

	return new Promise<void>((resolve, reject) => {
		let output = '';
		// --pull in prebuilt mode so a re-pushed tag (test-*) is fetched fresh.
		const args = ['compose', 'build'];
		if (noCache) args.push('--no-cache');
		if (usePrebuiltImage) args.push('--pull');
		const proc = spawn(getDockerBin(), args, {
			cwd: pipelineDir,
			env: {
				...getDockerEnv(),
				VAULT_PATH: pipelineDir,
				NOPE_IMAGE_HASH: pipelineImageHash(pluginDir),
				NOPE_DOCKERFILE: usePrebuiltImage ? 'Dockerfile.pull' : 'Dockerfile',
				NOPE_IMAGE_TAG: prebuiltImageTag(),
			},
			windowsHide: true,
		});

		const handleChunk = (chunk: Buffer) => {
			const text = chunk.toString();
			output += text;
			onOutput?.(text);
		};
		proc.stdout?.on('data', handleChunk);
		proc.stderr?.on('data', handleChunk);

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
// `onOutput` receives every stdout/stderr chunk for live progress reporting.
export async function runPipeline(
	pluginDir: string,
	vaultPath: string,
	mdRelPath: string,
	onOutput?: (chunk: string) => void,
): Promise<string> {
	const pipelineDir = join(pluginDir, 'pipeline');
	const buildDir = join(pipelineDir, 'build');

	// Container output PDF is mapped from /build/<basename>/<basename>.pdf to <pluginDir>/pipeline/build/...
	const baseName = mdRelPath
		.split('/')
		.pop()!
		.replace(/\.md$/i, '');
	const pdfPath = join(buildDir, baseName, `${baseName}.pdf`);
	// Run log lives with the document's intermediates (build/<doc>/build_sh.log);
	// only the docker image build log stays at the build/ root.
	const logFile = join(buildDir, baseName, 'build_sh.log');

	mkdirSync(join(buildDir, baseName), { recursive: true });

	const ready = await checkDockerReady();
	if (!ready.ok) throw new Error(ready.message);

	return new Promise<string>((resolve, reject) => {
		let output = '';
		const proc = spawn(getDockerBin(), ['compose', 'run', '--rm', 'pipeline', mdRelPath], {
			cwd: pipelineDir,
			env: { ...getDockerEnv(), VAULT_PATH: vaultPath },
			windowsHide: true,
		});

		const handleChunk = (chunk: Buffer) => {
			const text = chunk.toString();
			output += text;
			onOutput?.(text);
		};
		proc.stdout?.on('data', handleChunk);
		proc.stderr?.on('data', handleChunk);

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
