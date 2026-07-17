/** Manage the AI conventions skill: install it into the vault and report its status. */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

export const SKILL_RELATIVE_SOURCE = join('skill', 'SKILL.md');
export const SKILL_RELATIVE_TARGET = join('.claude', 'skills', 'nope', 'SKILL.md');

export type SkillStatus = 'missing' | 'outdated' | 'current';

export function getSkillSourcePath(pluginDir: string): string {
	return join(pluginDir, SKILL_RELATIVE_SOURCE);
}

export function getSkillTargetPath(vaultPath: string): string {
	return join(vaultPath, SKILL_RELATIVE_TARGET);
}

/** Compare source and installed skill. Returns 'missing', 'outdated' or 'current'. */
export function getSkillStatus(pluginDir: string, vaultPath: string): SkillStatus {
	const source = getSkillSourcePath(pluginDir);
	const target = getSkillTargetPath(vaultPath);
	if (!existsSync(target)) return 'missing';
	if (!existsSync(source)) return 'missing';
	return readFileSync(source).equals(readFileSync(target)) ? 'current' : 'outdated';
}

/** Install or update the skill in the vault, overwriting any existing file. Throws if the source is missing. */
export function installSkill(pluginDir: string, vaultPath: string): void {
	const source = getSkillSourcePath(pluginDir);
	const target = getSkillTargetPath(vaultPath);
	if (!existsSync(source)) {
		throw new Error(`Skill source missing: ${source}`);
	}
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(source, target);
}
