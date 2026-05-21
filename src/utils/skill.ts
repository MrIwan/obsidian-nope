// Install / status check for the user-facing AI-conventions skill.
//
// Source-of-Truth lives in the plugin repo at `skill/SKILL.md`. The install
// step copies it into the vault at `.claude/skills/obsi-print/SKILL.md` so AI
// agents working on notes can pick it up. Push is explicit (button-driven) —
// never automatic, so user edits to the installed skill aren't clobbered.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

export const SKILL_RELATIVE_SOURCE = join('skill', 'SKILL.md');
export const SKILL_RELATIVE_TARGET = join('.claude', 'skills', 'obsi-print', 'SKILL.md');

export type SkillStatus = 'missing' | 'outdated' | 'current';

export function getSkillSourcePath(pluginDir: string): string {
	return join(pluginDir, SKILL_RELATIVE_SOURCE);
}

export function getSkillTargetPath(vaultPath: string): string {
	return join(vaultPath, SKILL_RELATIVE_TARGET);
}

// Compare source and installed copy. 'missing' if target absent, 'current' if
// byte-equal, 'outdated' otherwise (covers both upstream changes and local
// edits — both states warrant a re-install prompt).
export function getSkillStatus(pluginDir: string, vaultPath: string): SkillStatus {
	const source = getSkillSourcePath(pluginDir);
	const target = getSkillTargetPath(vaultPath);
	if (!existsSync(target)) return 'missing';
	if (!existsSync(source)) return 'missing';
	return readFileSync(source).equals(readFileSync(target)) ? 'current' : 'outdated';
}

// Copy skill/SKILL.md → <vault>/.claude/skills/obsi-print/SKILL.md. Overwrites
// any existing file at the target (caller is responsible for confirm prompts).
export function installSkill(pluginDir: string, vaultPath: string): void {
	const source = getSkillSourcePath(pluginDir);
	const target = getSkillTargetPath(vaultPath);
	if (!existsSync(source)) {
		throw new Error(`Skill source missing: ${source}`);
	}
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(source, target);
}
