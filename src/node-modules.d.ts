// Minimal ambient stubs for the slice of Node.js builtins this plugin uses.
// Replaces @types/node entirely: the community scanner cannot resolve @types/*
// packages, so committed stubs are the only way both local lint and the
// scanner see identical types. Extend HERE when using a new Node API.
// This file must remain a "script" file (no top-level import/export).

interface Buffer extends Uint8Array {
	// Node buffers are ArrayBuffer-backed; narrows the ES2020 ArrayBufferLike union.
	readonly buffer: ArrayBuffer;
	equals(other: Uint8Array): boolean;
	toString(encoding?: string): string;
}

declare const Buffer: {
	from(data: string, encoding: 'base64'): Buffer;
};

declare const process: {
	readonly platform:
		| 'aix'
		| 'android'
		| 'cygwin'
		| 'darwin'
		| 'freebsd'
		| 'linux'
		| 'netbsd'
		| 'openbsd'
		| 'sunos'
		| 'win32';
	readonly env: Record<string, string | undefined>;
};

declare module 'fs' {
	export interface Stats {
		mtimeMs: number;
	}
	export function existsSync(path: string): boolean;
	export function readFileSync(path: string, encoding: 'utf8'): string;
	export function readFileSync(path: string): Buffer;
	export function writeFileSync(path: string, data: string | Uint8Array, encoding?: 'utf8'): void;
	export function appendFileSync(path: string, data: string): void;
	export function copyFileSync(src: string, dest: string): void;
	export function chmodSync(path: string, mode: number): void;
	export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
	export function readdirSync(path: string): string[];
	export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
	export function statSync(path: string): Stats;
}

declare module 'path' {
	export function join(...paths: string[]): string;
	export function dirname(path: string): string;
	export function basename(path: string, suffix?: string): string;
	export function relative(from: string, to: string): string;
	export function isAbsolute(path: string): boolean;
	export const sep: string;
	export const delimiter: string;
}

declare module 'os' {
	export function homedir(): string;
}

declare module 'crypto' {
	export interface Hash {
		update(data: string | Uint8Array): Hash;
		digest(encoding: 'hex'): string;
	}
	export function createHash(algorithm: string): Hash;
}

declare module 'child_process' {
	export interface ExecException extends Error {
		code?: number | string;
		killed?: boolean;
		signal?: string;
		cmd?: string;
	}
	export interface ProcessOptions {
		cwd?: string;
		env?: Record<string, string | undefined>;
		timeout?: number;
		windowsHide?: boolean;
	}
	export interface OutputStream {
		on(event: 'data', listener: (chunk: Buffer) => void): this;
	}
	export interface ChildProcess {
		stdout: OutputStream | null;
		stderr: OutputStream | null;
		on(event: 'error', listener: (err: Error) => void): this;
		on(event: 'close', listener: (code: number | null) => void): this;
	}
	export function execFile(
		file: string,
		args: string[],
		options: ProcessOptions,
		callback: (error: ExecException | null, stdout: string, stderr: string) => void,
	): ChildProcess;
	export function spawn(command: string, args: string[], options: ProcessOptions): ChildProcess;
}
