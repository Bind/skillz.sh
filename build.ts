#!/usr/bin/env bun

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKILLS_DIR = "skills";
const REGISTRY_FILE = "registry.json";

interface SkillMeta {
  name: string;
  description: string;
  version: string;
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): SkillMeta {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("No frontmatter found in SKILL.md");
  }

  const frontmatter = match[1]!;
  const meta: Record<string, string> = {};

  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      meta[key] = value;
    }
  }

  if (!meta.name || !meta.description || !meta.version) {
    throw new Error(
      "SKILL.md frontmatter must include name, description, and version"
    );
  }

  return {
    name: meta.name,
    description: meta.description,
    version: meta.version,
  };
}

/**
 * Process a single skill directory and extract metadata
 */
async function processSkill(skillName: string): Promise<SkillMeta | null> {
  const skillMdPath = join(SKILLS_DIR, skillName, "SKILL.md");

  const skillMdFile = Bun.file(skillMdPath);
  if (!(await skillMdFile.exists())) {
    console.log(`  Skipping ${skillName}: no SKILL.md found`);
    return null;
  }

  const skillMdContent = await skillMdFile.text();
  const meta = parseFrontmatter(skillMdContent);

  console.log(`  ${meta.name} v${meta.version}`);

  return meta;
}

/**
 * Main build function - generates registry.json from skills/
 */
async function build(): Promise<void> {
  console.log("\nBuilding registry.json...\n");

  const skillDirs = await readdir(SKILLS_DIR);
  const skills: SkillMeta[] = [];

  for (const skillName of skillDirs) {
    if (skillName.startsWith(".")) continue;

    try {
      const meta = await processSkill(skillName);
      if (meta) {
        skills.push(meta);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Error processing ${skillName}: ${message}`);
    }
  }

  const registry = {
    name: "skillz.sh",
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      version: s.version,
    })),
  };

  await Bun.write(REGISTRY_FILE, JSON.stringify(registry, null, 2) + "\n");

  console.log(`\nGenerated ${REGISTRY_FILE} with ${skills.length} skill(s).\n`);
}

build().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
