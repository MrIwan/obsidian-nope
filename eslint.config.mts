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
