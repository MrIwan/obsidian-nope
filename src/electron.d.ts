// Minimal ambient stub for the slice of Electron.
// Avoids pulling in the full @types/electron devDependency for one call.
// This file must remain a "script" file
declare module 'electron' {
	export const shell: {
		openPath(path: string): Promise<string>;
	};
}
