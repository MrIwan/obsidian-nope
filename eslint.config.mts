import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	...obsidianmd.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				activeDocument: 'readonly',
				activeWindow: 'readonly',
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// The Obsidian community-plugin audit runs the type-aware rules from eslint-plugin-obsidianmd 0.3 (recommendedTypeChecked) WITHOUT installing node_modules. See:
		// https://forum.obsidian.md/t/plugin-audit-reports-spurious-type-errors-because-it-doesnt-resolve-obsidian-types/115198
		// So we turn off the type-aware rules here, and rely on the type-aware rules in the plugin's own CI (which runs with node_modules installed).
		files: ['**/*.ts', '**/*.tsx'],
		rules: {
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-redundant-type-constituents': 'off',
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',
			'@typescript-eslint/prefer-promise-reject-errors': 'off',
		},
	},
	{
		files: ['package.json'],
		rules: {
			'obsidianmd/no-plugin-as-component': 'off',
			'obsidianmd/no-unsupported-api': 'off',
			'obsidianmd/no-view-references-in-plugin': 'off',
			'obsidianmd/prefer-file-manager-trash-file': 'off',
			'obsidianmd/prefer-instanceof': 'off',
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"scripts/**",
		"src/generated/**",
		"package-lock.json",
		"tsconfig.json",
		"manifest.json",
		".claude/**",
		"example-vault/**",
	]),
);
