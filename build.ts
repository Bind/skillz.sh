#!/usr/bin/env bun

import { readdir, mkdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";

const SKILLS_DIR = "skills";
const AGENTS_DIR = "agents";
const UTILS_DIR = "utils";
const SRC_DIR = "src";
const REGISTRY_FILE = "registry.json";
const REGISTRY_VERSION = "2.0.0";
const REGISTRY_BASE_PATH = "registry";
const DOCS_DIR = "docs";
const DOCS_REGISTRY_DIR = join(DOCS_DIR, REGISTRY_BASE_PATH);

// ============================================================================
// Types (mirrors cli/src/types.ts for build script)
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

/**
 * Parse YAML frontmatter from markdown content.
 */
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

/**
 * List files in a directory (non-recursive).
 */
async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * List subdirectories in a directory.
 */
async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  const file = Bun.file(filePath);
  return file.exists();
}

/**
 * Read and parse a JSON file.
 */
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

/**
 * Build file manifest for a skill by scanning its directory.
 */
async function buildSkillFiles(
  skillName: string,
  skillJson: SkillJson | null
): Promise<SkillFiles> {
  const skillDir = join(SKILLS_DIR, skillName);
  const files: SkillFiles = {
    skill: ["SKILL.md"],
  };

  // Add skill.json if it exists
  if (skillJson) {
    files.skill.push("skill.json");
  }

  // Entry points from skill.json
  if (skillJson?.entry) {
    files.entry = skillJson.entry;
  }

  // Commands: scan command/ directory or use skill.json commands array
  const commandDir = join(skillDir, "command");
  if (skillJson?.commands && skillJson.commands.length > 0) {
    // Use explicit commands list from skill.json
    files.commands = {};
    for (const cmdName of skillJson.commands) {
      const cmdDir = join(commandDir, cmdName);
      const cmdFiles = await listFiles(cmdDir);
      if (cmdFiles.length > 0) {
        files.commands[cmdName] = cmdFiles;
      }
    }
  } else {
    // Scan command/ directory for subdirectories
    const cmdDirs = await listDirs(commandDir);
    if (cmdDirs.length > 0) {
      files.commands = {};
      for (const cmdName of cmdDirs) {
        const cmdDir = join(commandDir, cmdName);
        const cmdFiles = await listFiles(cmdDir);
        if (cmdFiles.length > 0) {
          files.commands[cmdName] = cmdFiles;
        }
      }
    }
  }

  // Agents: scan agent/ directory or use skill.json agents array
  const agentDir = join(skillDir, "agent");
  if (skillJson?.agents && skillJson.agents.length > 0) {
    // Use explicit agents list from skill.json
    files.agents = skillJson.agents.map((a) =>
      a.endsWith(".md") ? a : `${a}.md`
    );
  } else {
    // Scan agent/ directory for .md files
    const agentFiles = await listFiles(agentDir);
    const mdFiles = agentFiles.filter((f) => f.endsWith(".md"));
    if (mdFiles.length > 0) {
      files.agents = mdFiles;
    }
  }

  // Static files from skill.json files array
  if (skillJson?.files && skillJson.files.length > 0) {
    files.static = skillJson.files;
  }

  // Clean up empty optional fields
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

/**
 * Process a single skill directory and build full registry entry.
 */
async function processSkill(skillName: string): Promise<RegistrySkill | null> {
  const skillMdPath = join(SKILLS_DIR, skillName, "SKILL.md");
  const skillJsonPath = join(SKILLS_DIR, skillName, "skill.json");

  // Check for SKILL.md
  if (!(await fileExists(skillMdPath))) {
    console.log(`  Skipping ${skillName}: no SKILL.md found`);
    return null;
  }

  // Parse frontmatter from SKILL.md
  const skillMdContent = await Bun.file(skillMdPath).text();
  const meta = parseFrontmatter(skillMdContent, "SKILL.md");

  // Read skill.json
  const skillJson = await readJsonFile<SkillJson>(skillJsonPath);

  // Build file manifest
  const files = await buildSkillFiles(skillName, skillJson);

  // Build registry entry
  const skill: RegistrySkill = {
    name: meta.name,
    description: meta.description,
    version: meta.version,
    files,
  };

  // Add optional fields from skill.json
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

/**
 * Process a single agent directory and build full registry entry.
 */
async function processAgent(agentName: string): Promise<RegistryAgent | null> {
  const agentDir = join(AGENTS_DIR, agentName);
  const agentMdPath = join(agentDir, "agent.md");
  const agentJsonPath = join(agentDir, "agent.json");

  // Check for agent.md
  if (!(await fileExists(agentMdPath))) {
    console.log(`  Skipping ${agentName}: no agent.md found`);
    return null;
  }

  // Parse frontmatter from agent.md
  const agentMdContent = await Bun.file(agentMdPath).text();
  const meta = parseFrontmatter(agentMdContent, "agent.md");

  // List all files in agent directory
  const allFiles = await listFiles(agentDir);

  // Read agent.json if it exists
  const agentJson = await readJsonFile<AgentJson>(agentJsonPath);

  // Build registry entry
  const agent: RegistryAgent = {
    name: meta.name,
    description: meta.description,
    version: meta.version,
    files: allFiles,
  };

  // Add optional fields from agent.json
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

/**
 * Scan utils/ directory for all .ts files.
 */
async function scanUtils(): Promise<string[]> {
  const files = await listFiles(UTILS_DIR);
  return files.filter((f) => f.endsWith(".ts"));
}

// ============================================================================
// Main Build
// ============================================================================

async function build(): Promise<void> {
  console.log("\nBuilding registry.json (v2 format)...\n");

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
  let agentDirs: string[] = [];
  try {
    agentDirs = await listDirs(AGENTS_DIR);
  } catch {
    console.log("  No agents/ directory found");
  }

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
    basePath: REGISTRY_BASE_PATH,
    skills,
    agents,
    utils,
  };

  const registryJson = JSON.stringify(registry, null, 2) + "\n";

  // Write to root registry.json (for local development)
  await Bun.write(REGISTRY_FILE, registryJson);

  // Write to docs/registry.json for GitHub Pages
  await Bun.write(join(DOCS_DIR, "registry.json"), registryJson);

  // Copy source files to docs/registry/
  console.log("\nCopying files to docs/registry/...");
  await copyRegistryFiles();

  console.log(
    `\nGenerated ${REGISTRY_FILE} v${REGISTRY_VERSION} with ${skills.length} skill(s), ${agents.length} agent(s), and ${utils.length} util(s).\n`
  );
}

/**
 * Copy all registry files to docs/registry/ for CDN hosting.
 */
async function copyRegistryFiles(): Promise<void> {
  // Clean existing docs/registry/ directory
  try {
    await rm(DOCS_REGISTRY_DIR, { recursive: true });
  } catch {
    // Directory doesn't exist, that's fine
  }

  // Clean old directories that were at docs/ root (migration from old structure)
  for (const oldDir of [SKILLS_DIR, AGENTS_DIR, UTILS_DIR, SRC_DIR]) {
    try {
      await rm(join(DOCS_DIR, oldDir), { recursive: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  }

  // Create docs/registry/ directory
  await mkdir(DOCS_REGISTRY_DIR, { recursive: true });

  // Copy skills/
  try {
    await cp(SKILLS_DIR, join(DOCS_REGISTRY_DIR, SKILLS_DIR), { recursive: true });
    console.log(`  Copied ${SKILLS_DIR}/`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Error copying ${SKILLS_DIR}/: ${message}`);
  }

  // Copy agents/
  try {
    await cp(AGENTS_DIR, join(DOCS_REGISTRY_DIR, AGENTS_DIR), { recursive: true });
    console.log(`  Copied ${AGENTS_DIR}/`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Error copying ${AGENTS_DIR}/: ${message}`);
  }

  // Copy utils/
  try {
    await cp(UTILS_DIR, join(DOCS_REGISTRY_DIR, UTILS_DIR), { recursive: true });
    console.log(`  Copied ${UTILS_DIR}/`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Error copying ${UTILS_DIR}/: ${message}`);
  }

  // Copy src/
  try {
    await cp(SRC_DIR, join(DOCS_REGISTRY_DIR, SRC_DIR), { recursive: true });
    console.log(`  Copied ${SRC_DIR}/`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Error copying ${SRC_DIR}/: ${message}`);
  }
}

build().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
