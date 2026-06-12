
export interface NopeSettings {
	/** Absolute or vault-relative path where the final PDF is copied after a successful build. */
	outputPath: string;
	autoOpenPdf: boolean;
	keepLatexIntermediates: boolean;
	dockerPath: string;
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
