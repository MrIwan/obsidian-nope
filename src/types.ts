
export interface ObsiPrintSettings {
	/** Absolute or vault-relative path where the final PDF is copied after a successful build. */
	outputPath: string;
	autoOpenPdf: boolean;
	keepLatexIntermediates: boolean;
}

export interface PreflightCheckResult {
	name: string;
	passed: boolean;
	message: string;
}

export interface PreflightResults {
	all_passed: boolean;
	checks: PreflightCheckResult[];
	timestamp: number;
}

export {};
