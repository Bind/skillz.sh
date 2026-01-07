#!/usr/bin/env bun

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKILLS_DIR = "skills";
const AGENTS_DIR = "agents";
const REGISTRY_FILE = "registry.json";

interface ItemMeta {
  name: string;
  description: string;
  version: string;
  domain?: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Works for both SKILL.md and agent.md files.
 */
function parseFrontmatter(content: string, fileName: string): ItemMeta {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error(`No frontmatter found in ${fileName}`);
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
      `${fileName} frontmatter must include name, description, and version`
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
async function processSkill(skillName: string): Promise<ItemMeta | null> {
  const skillMdPath = join(SKILLS_DIR, skillName, "SKILL.md");
  const skillJsonPath = join(SKILLS_DIR, skillName, "skill.json");

  const skillMdFile = Bun.file(skillMdPath);
  if (!(await skillMdFile.exists())) {
    console.log(`  Skipping ${skillName}: no SKILL.md found`);
    return null;
  }

  const skillMdContent = await skillMdFile.text();
  const meta = parseFrontmatter(skillMdContent, "SKILL.md");

  // Read domain from skill.json if it exists
  const skillJsonFile = Bun.file(skillJsonPath);
  if (await skillJsonFile.exists()) {
    try {
      const skillJson = (await skillJsonFile.json()) as { domain?: string };
      if (skillJson.domain) {
        meta.domain = skillJson.domain;
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  console.log(`  ${meta.name} v${meta.version}${meta.domain ? ` [${meta.domain}]` : ""}`);

  return meta;
}

/**
 * Process a single agent directory and extract metadata
 */
async function processAgent(agentName: string): Promise<ItemMeta | null> {
  const agentMdPath = join(AGENTS_DIR, agentName, "agent.md");

  const agentMdFile = Bun.file(agentMdPath);
  if (!(await agentMdFile.exists())) {
    console.log(`  Skipping ${agentName}: no agent.md found`);
    return null;
  }

  const agentMdContent = await agentMdFile.text();
  const meta = parseFrontmatter(agentMdContent, "agent.md");

  console.log(`  ${meta.name} v${meta.version}`);

  return meta;
}

/**
 * Main build function - generates registry.json from skills/ and agents/
 */
async function build(): Promise<void> {
  console.log("\nBuilding registry.json...\n");

  // Process skills
  console.log("Skills:");
  const skillDirs = await readdir(SKILLS_DIR);
  const skills: ItemMeta[] = [];

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

  // Process agents
  console.log("\nAgents:");
  let agentDirs: string[] = [];
  try {
    agentDirs = await readdir(AGENTS_DIR);
  } catch {
    console.log("  No agents/ directory found");
  }

  const agents: ItemMeta[] = [];

  for (const agentName of agentDirs) {
    if (agentName.startsWith(".")) continue;

    try {
      const meta = await processAgent(agentName);
      if (meta) {
        agents.push(meta);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Error processing ${agentName}: ${message}`);
    }
  }

  const registry = {
    name: "skillz.sh",
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      version: s.version,
      ...(s.domain && { domain: s.domain }),
    })),
    agents: agents.map((a) => ({
      name: a.name,
      description: a.description,
      version: a.version,
    })),
  };

  const registryJson = JSON.stringify(registry, null, 2) + "\n";

  // Write to root registry.json
  await Bun.write(REGISTRY_FILE, registryJson);

  // Also write to docs/registry.json for GitHub Pages
  await Bun.write("docs/registry.json", registryJson);

  console.log(
    `\nGenerated ${REGISTRY_FILE} with ${skills.length} skill(s) and ${agents.length} agent(s).\n`
  );
}

build().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
