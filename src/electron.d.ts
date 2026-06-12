// Minimal ambient stub for the slice of Electron.
// Avoids pulling in the full @types/electron devDependency for one call.
// This file must remain a "script" file
declare module 'electron' {
	export const shell: {
		openPath(path: string): Promise<string>;
	};
	// Native dialogs via @electron/remote, which Obsidian exposes on the module.
	export const remote: {
		dialog: {
			showOpenDialog(options: {
				title?: string;
				defaultPath?: string;
				properties?: string[];
			}): Promise<{ canceled: boolean; filePaths: string[] }>;
		};
	};
}
