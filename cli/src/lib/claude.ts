import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLAUDE_DIR, CLAUDE_SKILLS_DIR } from "../types.ts";

export interface FileToInstall {
  relativePath: string;
  content: string;
}

const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

export interface ClaudePermissions {
  allow?: string[];
  deny?: string[];
  ask?: string[];
}

export interface ClaudeSettings {
  permissions?: ClaudePermissions;
  [key: string]: unknown;
}

/**
 * Read Claude settings from .claude/settings.json
 */
export async function readClaudeSettings(): Promise<ClaudeSettings> {
  const file = Bun.file(CLAUDE_SETTINGS_PATH);
  if (await file.exists()) {
    try {
      return (await file.json()) as ClaudeSettings;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Write Claude settings to .claude/settings.json
 */
export async function writeClaudeSettings(settings: ClaudeSettings): Promise<void> {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await Bun.write(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Add skill permissions to Claude settings.
 * Read skills get "allow", write skills get "ask".
 */
export async function addClaudeSkillPermissions(skillNames: string[]): Promise<void> {
  const settings = await readClaudeSettings();
  
  if (!settings.permissions) {
    settings.permissions = {};
  }
  
  const allow = new Set(settings.permissions.allow ?? []);
  const ask = new Set(settings.permissions.ask ?? []);
  
  for (const skillName of skillNames) {
    // Pattern: Bash(bun .claude/skills/<skill-name>/*.ts:*)
    const pattern = `Bash(bun .claude/skills/${skillName}/*.ts:*)`;
    
    if (skillName.endsWith("-read")) {
      allow.add(pattern);
      ask.delete(pattern); // Remove from ask if it was there
    } else if (skillName.endsWith("-write")) {
      ask.add(pattern);
      allow.delete(pattern); // Remove from allow if it was there
    } else {
      // Default to ask for unknown patterns
      ask.add(pattern);
    }
  }
  
  settings.permissions.allow = [...allow];
  settings.permissions.ask = [...ask];
  
  // Clean up empty arrays
  if (settings.permissions.allow?.length === 0) {
    delete settings.permissions.allow;
  }
  if (settings.permissions.ask?.length === 0) {
    delete settings.permissions.ask;
  }
  
  await writeClaudeSettings(settings);
}

export async function installClaudeSkill(
  skillName: string,
  files: FileToInstall[]
): Promise<string[]> {
  const skillDir = join(CLAUDE_SKILLS_DIR, skillName);
  const installedPaths: string[] = [];

  for (const file of files) {
    const fullPath = join(skillDir, file.relativePath);
    const dir = dirname(fullPath);

    await mkdir(dir, { recursive: true });
    await Bun.write(fullPath, file.content);
    installedPaths.push(fullPath);
  }

  return installedPaths;
}

export async function claudeSkillExists(skillName: string): Promise<boolean> {
  const skillPath = join(CLAUDE_SKILLS_DIR, skillName, "SKILL.md");
  const file = Bun.file(skillPath);
  return file.exists();
}

export async function ensureClaudeSkillsDir(): Promise<void> {
  await mkdir(CLAUDE_SKILLS_DIR, { recursive: true });
}
