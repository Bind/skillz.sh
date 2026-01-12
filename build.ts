#!/usr/bin/env bun

import { readdir, mkdir, cp, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SKILLS_DIR = "registry/skills";
const AGENTS_DIR = "registry/agents";
const UTILS_DIR = "registry/utils";

// Source directories (copied to registry/ during build)
const SRC_SKILLS_DIR = "skills";
const SRC_AGENTS_DIR = "agents";
const SRC_UTILS_DIR = "utils";
const REGISTRY_FILE = "registry/registry.json";
const REGISTRY_VERSION = "2.0.0";
const DOCS_PUBLIC_DIR = "docs/public";

// ============================================================================
// Types
// ============================================================================

interface SkillFiles {
  skill: string[];
  commands?: Record<string, string[]>;
  agents?: string[];
  entry?: Record<string, string>;
  static?: string[];
}

interface SkillSetup {
  env?: string[];
  instructions?: string;
  prompts?: unknown[];
  configFile?: string;
}

interface SkillJson {
  domain?: string;
  entry?: Record<string, string>;
  files?: string[];
  utils?: string[];
  dependencies?: Record<string, string>;
  setup?: SkillSetup;
  requires?: string[];
  commands?: string[];
  agents?: string[];
}

interface AgentJson {
  mcp?: Record<string, unknown>;
  skills?: string[];
}

interface RegistrySkill {
  name: string;
  description: string;
  version: string;
  domain?: string;
  requires?: string[];
  utils?: string[];
  dependencies?: Record<string, string>;
  setup?: SkillSetup;
  files: SkillFiles;
}

interface RegistryAgent {
  name: string;
  description: string;
  version: string;
  files: string[];
  mcp?: Record<string, unknown>;
  skills?: string[];
}

interface Registry {
  name: string;
  version: string;
  basePath?: string;
  skills: RegistrySkill[];
  agents: RegistryAgent[];
  utils: string[];
}

// ============================================================================
// Helpers
// ============================================================================

function parseFrontmatter(
  content: string,
  fileName: string
): { name: string; description: string; version: string } {
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

async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  const file = Bun.file(filePath);
  return file.exists();
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// Skill Processing
// ============================================================================

async function buildSkillFiles(
  skillName: string,
  skillJson: SkillJson | null
): Promise<SkillFiles> {
  const skillDir = join(SKILLS_DIR, skillName);
  const files: SkillFiles = {
    skill: ["SKILL.md"],
  };

  if (skillJson) {
    files.skill.push("skill.json");
  }

  if (skillJson?.entry) {
    files.entry = skillJson.entry;
  }

  if (files.commands && Object.keys(files.commands).length === 0) {
    delete files.commands;
  }
  if (files.agents && files.agents.length === 0) {
    delete files.agents;
  }
  if (files.entry && Object.keys(files.entry).length === 0) {
    delete files.entry;
  }
  if (files.static && files.static.length === 0) {
    delete files.static;
  }

  return files;
}

async function processSkill(skillName: string): Promise<RegistrySkill | null> {
  const skillMdPath = join(SKILLS_DIR, skillName, "SKILL.md");
  const skillJsonPath = join(SKILLS_DIR, skillName, "skill.json");

  if (!(await fileExists(skillMdPath))) {
    console.log(`  Skipping ${skillName}: no SKILL.md found`);
    return null;
  }

  const skillMdContent = await Bun.file(skillMdPath).text();
  const meta = parseFrontmatter(skillMdContent, "SKILL.md");

  const skillJson = await readJsonFile<SkillJson>(skillJsonPath);
  const files = await buildSkillFiles(skillName, skillJson);

  const skill: RegistrySkill = {
    name: meta.name,
    description: meta.description,
    version: meta.version,
    files,
  };

  if (skillJson?.domain) {
    skill.domain = skillJson.domain;
  }
  if (skillJson?.requires && skillJson.requires.length > 0) {
    skill.requires = skillJson.requires;
  }
  if (skillJson?.utils && skillJson.utils.length > 0) {
    skill.utils = skillJson.utils;
  }
  if (skillJson?.dependencies && Object.keys(skillJson.dependencies).length > 0) {
    skill.dependencies = skillJson.dependencies;
  }
  if (skillJson?.setup) {
    skill.setup = skillJson.setup;
  }

  console.log(
    `  ${meta.name} v${meta.version}${skill.domain ? ` [${skill.domain}]` : ""}`
  );

  return skill;
}

// ============================================================================
// Agent Processing
// ============================================================================

async function processAgent(agentName: string): Promise<RegistryAgent | null> {
  const agentDir = join(AGENTS_DIR, agentName);
  const agentMdPath = join(agentDir, "agent.md");
  const agentJsonPath = join(agentDir, "agent.json");

  if (!(await fileExists(agentMdPath))) {
    console.log(`  Skipping ${agentName}: no agent.md found`);
    return null;
  }

  const agentMdContent = await Bun.file(agentMdPath).text();
  const meta = parseFrontmatter(agentMdContent, "agent.md");

  const allFiles = await readdir(agentDir);
  const agentJson = await readJsonFile<AgentJson>(agentJsonPath);

  const agent: RegistryAgent = {
    name: meta.name,
    description: meta.description,
    version: meta.version,
    files: allFiles,
  };

  if (agentJson?.mcp && Object.keys(agentJson.mcp).length > 0) {
    agent.mcp = agentJson.mcp;
  }
  if (agentJson?.skills && agentJson.skills.length > 0) {
    agent.skills = agentJson.skills;
  }

  console.log(`  ${meta.name} v${meta.version}`);

  return agent;
}

// ============================================================================
// Utils Processing
// ============================================================================

async function scanUtils(): Promise<string[]> {
  try {
    const files = await readdir(UTILS_DIR);
    return files.filter((f) => f.endsWith(".ts"));
  } catch {
    return [];
  }
}

// ============================================================================
// Sync Source to Registry
// ============================================================================

async function syncToRegistry(): Promise<void> {
  // Sync skills/ -> registry/skills/
  await mkdir(SKILLS_DIR, { recursive: true });
  const srcSkills = await listDirs(SRC_SKILLS_DIR);
  for (const skill of srcSkills) {
    if (skill.startsWith(".")) continue;
    const src = join(SRC_SKILLS_DIR, skill);
    const dest = join(SKILLS_DIR, skill);
    await cp(src, dest, { recursive: true });
  }

  // Sync agents/ -> registry/agents/
  await mkdir(AGENTS_DIR, { recursive: true });
  const srcAgents = await listDirs(SRC_AGENTS_DIR);
  for (const agent of srcAgents) {
    if (agent.startsWith(".")) continue;
    const src = join(SRC_AGENTS_DIR, agent);
    const dest = join(AGENTS_DIR, agent);
    await cp(src, dest, { recursive: true });
  }

  // Sync utils/ -> registry/utils/
  await mkdir(UTILS_DIR, { recursive: true });
  await cp(SRC_UTILS_DIR, UTILS_DIR, { recursive: true });

  // Sync src/ -> registry/src/
  await mkdir("registry/src", { recursive: true });
  await cp("src", "registry/src", { recursive: true });
}

// ============================================================================
// Main Build
// ============================================================================

async function build(): Promise<void> {
  console.log("\nBuilding registry.json (v2 format)...\n");

  // Sync source to registry
  console.log("Syncing source to registry/...");
  await syncToRegistry();

  // Process skills
  console.log("Skills:");
  const skillDirs = await listDirs(SKILLS_DIR);
  const skills: RegistrySkill[] = [];

  for (const skillName of skillDirs) {
    if (skillName.startsWith(".")) continue;

    try {
      const skill = await processSkill(skillName);
      if (skill) {
        skills.push(skill);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Error processing ${skillName}: ${message}`);
    }
  }

  // Process agents
  console.log("\nAgents:");
  const agentDirs = await listDirs(AGENTS_DIR);
  const agents: RegistryAgent[] = [];

  for (const agentName of agentDirs) {
    if (agentName.startsWith(".")) continue;

    try {
      const agent = await processAgent(agentName);
      if (agent) {
        agents.push(agent);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Error processing ${agentName}: ${message}`);
    }
  }

  // Scan utils
  console.log("\nUtils:");
  const utils = await scanUtils();
  for (const util of utils) {
    console.log(`  ${util}`);
  }

  // Build registry
  const registry: Registry = {
    name: "skillz.sh",
    version: REGISTRY_VERSION,
    basePath: "registry",
    skills,
    agents,
    utils,
  };

  const registryJson = JSON.stringify(registry, null, 2) + "\n";

  // Write to registry/registry.json
  await mkdir("registry", { recursive: true });
  await writeFile(REGISTRY_FILE, registryJson);
  console.log(`\n  Wrote ${REGISTRY_FILE}`);

  // Copy to docs/public/registry.json for Astro
  await mkdir(DOCS_PUBLIC_DIR, { recursive: true });
  await writeFile(join(DOCS_PUBLIC_DIR, "registry.json"), registryJson);
  console.log(`  Wrote ${join(DOCS_PUBLIC_DIR, "registry.json")}`);

  console.log(
    `\nGenerated ${REGISTRY_FILE} v${REGISTRY_VERSION} with ${skills.length} skill(s), ${agents.length} agent(s), and ${utils.length} util(s).\n`
  );
}

build().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
