/** Shared settings and preflight type definitions. */

/** Persisted plugin settings. */
export interface NopeSettings {
	/** Absolute or vault-relative path where the final PDF is copied after a successful build. */
	outputPath: string;
	autoOpenPdf: boolean;
	followOnModClick: boolean;
	keepLatexIntermediates: boolean;
	dockerPath: string;
	previewAutoRender: boolean;
	usePrebuiltImage: boolean;
	imageTag: string;
}

/** Outcome of a single preflight check. */
export interface PreflightCheckResult {
	name: string;
	passed: boolean;
	message: string;
	skipped?: boolean;
}

/** Aggregated result of a preflight run. */
export interface PreflightResults {
	all_passed: boolean;
	checks: PreflightCheckResult[];
	timestamp: number;
}

export {};
