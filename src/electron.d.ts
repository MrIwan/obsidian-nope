// Minimal ambient stub for the slice of Electron we actually use.
// Avoids pulling in the full @types/electron devDependency for one call.
// This file has no top-level imports/exports on purpose — it must remain a
// "script" file (not a module) so the declare module below is treated as an
// ambient declaration rather than module augmentation.
declare module 'electron' {
	export const shell: {
		openPath(path: string): Promise<string>;
	};
}
