
export interface NopeSettings {
	/** Absolute or vault-relative path where the final PDF is copied after a successful build. */
	outputPath: string;
	autoOpenPdf: boolean;
	followOnModClick: boolean;
	keepLatexIntermediates: boolean;
	dockerPath: string;
	previewAutoRender: boolean;
	/** Accumulated tlmgr packages requested via nope-tlmgr frontmatter; baked into the image, reset on image removal. */
	texPackages: string[];
	usePrebuiltImage: boolean;
	imageTag: string;
}

export interface PreflightCheckResult {
	name: string;
	passed: boolean;
	message: string;
	skipped?: boolean;
}

export interface PreflightResults {
	all_passed: boolean;
	checks: PreflightCheckResult[];
	timestamp: number;
}

export {};
