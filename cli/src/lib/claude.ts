import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLAUDE_SKILLS_DIR, type SkillJson } from "../types.ts";

export interface FileToInstall {
  relativePath: string;
  content: string;
}

export async function installClaudeSkill(
  skillName: string,
  files: FileToInstall[],
  _skillJson?: SkillJson
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
