import { select } from "@inquirer/prompts";
import { stat } from "node:fs/promises";
import { NEW_CONFIG_PATH, LEGACY_CONFIG_PATH, CLAUDE_DIR, CLAUDE_SKILLS_DIR, type SkillTarget } from "../types.ts";
import { readConfig } from "./config.ts";

export interface ProjectConfig {
  hasOpenCode: boolean;
  hasClaude: boolean;
  target: "opencode" | "claude";
}

export async function detectProjectConfig(): Promise<ProjectConfig> {
  const hasOpenCode = await configExists();
  const hasClaude = await claudeDirExists();

  if (!hasOpenCode && !hasClaude) {
    return { hasOpenCode: false, hasClaude: false, target: "opencode" };
  }

  const config = await readConfig();
  const preferredTarget = config?.target ?? "auto";

  if (preferredTarget !== "auto") {
    const target = preferredTarget === "claude" && hasClaude ? "claude" : "opencode";
    return { hasOpenCode, hasClaude, target };
  }

  if (hasOpenCode && hasClaude) {
    const target = await select({
      message: "Detected both OpenCode and Claude directories. Where would you like to install skills?",
      choices: [
        { name: "OpenCode (.opencode/skill/)", value: "opencode", description: "Install to .opencode/skill/ for OpenCode" },
        { name: "Claude (.claude/skills/)", value: "claude", description: "Install to .claude/skills/ for Claude" },
      ],
    }) as "opencode" | "claude";
    return { hasOpenCode, hasClaude, target };
  }

  if (hasClaude) {
    return { hasOpenCode: false, hasClaude: true, target: "claude" };
  }

  return { hasOpenCode: true, hasClaude: false, target: "opencode" };
}

async function configExists(): Promise<boolean> {
  const newFile = Bun.file(NEW_CONFIG_PATH);
  if (await newFile.exists()) return true;

  const legacyFile = Bun.file(LEGACY_CONFIG_PATH);
  return legacyFile.exists();
}

async function claudeDirExists(): Promise<boolean> {
  try {
    const stats = await stat(CLAUDE_DIR);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function defaultTarget(target: SkillTarget | undefined): "opencode" | "claude" {
  if (target === "claude" || target === "opencode") {
    return target;
  }
  return "opencode";
}
