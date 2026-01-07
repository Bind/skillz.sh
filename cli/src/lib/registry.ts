import { fetchFile, fetchJson } from "./github.ts";
import {
  SKILLS_DIR,
  COMMANDS_DIR,
  AGENTS_DIR,
  type Registry,
  type RegistrySkill,
  type RegistryAgent,
} from "../types.ts";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface FileToInstall {
  /** Path relative to skill install directory */
  relativePath: string;
  content: string;
}

export interface SkillWithRegistry extends RegistrySkill {
  registry: string;
  registryName: string;
  /** Base path for file fetches (from registry.basePath) */
  basePath?: string;
}

export interface AgentWithRegistry extends RegistryAgent {
  registry: string;
  registryName: string;
  /** Base path for file fetches (from registry.basePath) */
  basePath?: string;
}

// ============================================================================
// Registry Fetching
// ============================================================================

export async function fetchRegistry(registryUrl: string): Promise<Registry> {
  const registry = await fetchJson<Registry>(registryUrl, "registry.json");

  // Validate registry has required version field (v2 format)
  if (!registry.version) {
    throw new Error(
      `Invalid registry format: missing 'version' field. Registry v2 format required.`
    );
  }

  return registry;
}

/**
 * Fetches a single util file from utils/
 */
export async function fetchUtilFile(
  registryUrl: string,
  utilPath: string,
  basePath?: string
): Promise<string> {
  return fetchFile(registryUrl, `utils/${utilPath}`, basePath);
}

/**
 * Check if a util file exists locally
 */
export async function utilExists(
  utilsDir: string,
  utilPath: string
): Promise<boolean> {
  const fullPath = join(utilsDir, utilPath);
  const file = Bun.file(fullPath);
  return file.exists();
}

/**
 * Install a util file to the utils directory
 */
export async function installUtil(
  utilsDir: string,
  utilPath: string,
  content: string
): Promise<string> {
  const fullPath = join(utilsDir, utilPath);
  const dir = dirname(fullPath);

  await mkdir(dir, { recursive: true });
  await Bun.write(fullPath, content);

  return fullPath;
}

/**
 * Transform import paths for installed skill files.
 *
 * Source files in src/<skill>/ import from "../../utils/"
 *
 * Installed files at .opencode/skill/<name>/ need different paths:
 * - New config (.opencode/skz.json with utils: "./utils"):
 *   utils at .opencode/utils/ -> import "../../utils/" (no change needed)
 * - Legacy config (./skz.json with utils: "utils"):
 *   utils at ./utils/ -> import "../../../utils/"
 */
function transformImports(content: string, isLegacyConfig: boolean): string {
  if (isLegacyConfig) {
    // Legacy: .opencode/skill/<name>/ needs ../../../utils/ to reach ./utils/
    return content.replace(
      /from ["']\.\.\/\.\.\/utils\//g,
      'from "../../../utils/'
    );
  }
  // New: .opencode/skill/<name>/ needs ../../utils/ to reach .opencode/utils/
  // Source already uses ../../utils/, so no transformation needed
  return content;
}

/**
 * Transform content for Claude Code installation.
 * - Replaces AGENTS.md references with CLAUDE.md
 * - Removes 'agent:' field from frontmatter (not supported in Claude Code)
 */
function transformForClaude(content: string): string {
  let result = content.replace(/AGENTS\.md/g, "CLAUDE.md");
  // Remove 'agent:' from frontmatter (Claude Code doesn't support it)
  result = result.replace(/^agent: .*\n/m, "");
  return result;
}

/**
 * Transform content for OpenCode installation.
 * - Removes 'allowed-tools:' from frontmatter (OpenCode uses different permission system)
 */
function transformForOpenCode(content: string): string {
  // Remove 'allowed-tools:' from frontmatter (OpenCode uses opencode.json permissions)
  return content.replace(/^allowed-tools: .*\n/m, "");
}

/**
 * Fetches all files for a skill using the registry manifest.
 *
 * Uses the skill.files manifest from the registry to know exactly which files to fetch.
 * No directory listing required - works with any CDN.
 *
 * @param registryUrl - Base URL of the registry
 * @param skill - Full skill entry from registry (includes files manifest and basePath)
 * @param isLegacyConfig - If true, transforms imports for legacy config location
 */
export async function fetchSkillFiles(
  registryUrl: string,
  skill: SkillWithRegistry,
  isLegacyConfig: boolean = false
): Promise<FileToInstall[]> {
  const files: FileToInstall[] = [];
  const skillName = skill.name;
  const basePath = skill.basePath;

  // Fetch core skill files (SKILL.md, skill.json, etc.)
  for (const fileName of skill.files.skill) {
    try {
      const content = await fetchFile(
        registryUrl,
        `skills/${skillName}/${fileName}`,
        basePath
      );
      files.push({ relativePath: fileName, content });
    } catch {
      // Skip if file fetch fails (but SKILL.md is required)
      if (fileName === "SKILL.md") {
        throw new Error(`Failed to fetch required file: skills/${skillName}/SKILL.md`);
      }
    }
  }

  // Fetch entry point files (TypeScript source files)
  if (skill.files.entry) {
    for (const [outputName, sourcePath] of Object.entries(skill.files.entry)) {
      const content = await fetchFile(registryUrl, sourcePath, basePath);
      const transformedContent = transformImports(content, isLegacyConfig);
      files.push({
        relativePath: `${outputName}.ts`,
        content: transformedContent,
      });
    }
  }

  // Fetch command files
  // Commands are installed to .opencode/command/<name>.md
  if (skill.files.commands) {
    for (const [commandName, commandFiles] of Object.entries(skill.files.commands)) {
      for (const fileName of commandFiles) {
        try {
          const content = await fetchFile(
            registryUrl,
            `skills/${skillName}/command/${commandName}/${fileName}`,
            basePath
          );
          // Transform content for OpenCode (remove allowed-tools)
          const transformedContent = transformForOpenCode(content);
          // Flatten command structure: command/code_review/command.md -> command/code_review.md
          const outputName = fileName === "command.md" ? `${commandName}.md` : `${commandName}/${fileName}`;
          files.push({
            relativePath: `command/${outputName}`,
            content: transformedContent,
          });
        } catch {
          // Skip if command file fetch fails
        }
      }
    }
  }

  // Fetch agent files
  // Agents are installed to .opencode/agent/<name>.md
  if (skill.files.agents) {
    for (const agentFile of skill.files.agents) {
      try {
        const content = await fetchFile(
          registryUrl,
          `skills/${skillName}/agent/${agentFile}`,
          basePath
        );
        files.push({
          relativePath: `agent/${agentFile}`,
          content,
        });
      } catch {
        // Skip if agent file fetch fails
      }
    }
  }

  // Fetch static files (schema.yaml, README.md, etc.)
  // These are installed alongside SKILL.md in the skill directory
  if (skill.files.static) {
    for (const filePath of skill.files.static) {
      try {
        const content = await fetchFile(
          registryUrl,
          `skills/${skillName}/${filePath}`,
          basePath
        );
        files.push({
          relativePath: filePath,
          content,
        });
      } catch {
        // Skip if file fetch fails
      }
    }
  }

  return files;
}

/**
 * Fetches all files for a Claude skill using the registry manifest.
 *
 * Unlike OpenCode skills, Claude skills don't use shared utils,
 * so no import transformation is needed.
 *
 * Content is transformed to:
 * - Replace AGENTS.md references with CLAUDE.md
 * - Remove 'agent:' field from frontmatter
 * - Keep 'allowed-tools:' for Claude Code
 */
export async function fetchClaudeSkillFiles(
  registryUrl: string,
  skill: SkillWithRegistry
): Promise<FileToInstall[]> {
  const files: FileToInstall[] = [];
  const skillName = skill.name;
  const basePath = skill.basePath;

  // Fetch core skill files
  for (const fileName of skill.files.skill) {
    try {
      const content = await fetchFile(
        registryUrl,
        `skills/${skillName}/${fileName}`,
        basePath
      );
      files.push({
        relativePath: fileName,
        content: transformForClaude(content),
      });
    } catch {
      if (fileName === "SKILL.md") {
        throw new Error(`Failed to fetch required file: skills/${skillName}/SKILL.md`);
      }
    }
  }

  // Fetch entry point files (no import transformation for Claude)
  if (skill.files.entry) {
    for (const [outputName, sourcePath] of Object.entries(skill.files.entry)) {
      const content = await fetchFile(registryUrl, sourcePath, basePath);
      files.push({
        relativePath: `${outputName}.ts`,
        content: transformForClaude(content),
      });
    }
  }

  // Fetch command files (keep directory structure for Claude)
  if (skill.files.commands) {
    for (const [commandName, commandFiles] of Object.entries(skill.files.commands)) {
      for (const fileName of commandFiles) {
        try {
          const content = await fetchFile(
            registryUrl,
            `skills/${skillName}/command/${commandName}/${fileName}`,
            basePath
          );
          files.push({
            relativePath: `command/${commandName}/${fileName}`,
            content: transformForClaude(content),
          });
        } catch {
          // Skip if command file fetch fails
        }
      }
    }
  }

  // Fetch agent files
  if (skill.files.agents) {
    for (const agentFile of skill.files.agents) {
      try {
        const content = await fetchFile(
          registryUrl,
          `skills/${skillName}/agent/${agentFile}`,
          basePath
        );
        files.push({
          relativePath: `agent/${agentFile}`,
          content: transformForClaude(content),
        });
      } catch {
        // Skip if agent file fetch fails
      }
    }
  }

  // Fetch static files
  if (skill.files.static) {
    for (const filePath of skill.files.static) {
      try {
        const content = await fetchFile(
          registryUrl,
          `skills/${skillName}/${filePath}`,
          basePath
        );
        files.push({
          relativePath: filePath,
          content: transformForClaude(content),
        });
      } catch {
        // Skip if file fetch fails
      }
    }
  }

  return files;
}

/**
 * Installs a skill with all its files.
 * - Skill files go to .opencode/skill/<name>/
 * - Command files go to .opencode/command/<name>.md
 * - Agent files go to .opencode/agent/<name>.md
 */
export async function installSkillFiles(
  skillName: string,
  files: FileToInstall[]
): Promise<string[]> {
  const skillDir = join(SKILLS_DIR, skillName);
  const installedPaths: string[] = [];

  for (const file of files) {
    let fullPath: string;

    // Check if this is a command or agent file
    if (file.relativePath.startsWith("command/")) {
      // Command files go to .opencode/command/
      const commandName = file.relativePath.replace(/^command\//, "");
      fullPath = join(COMMANDS_DIR, commandName);
    } else if (file.relativePath.startsWith("agent/")) {
      // Agent files go to .opencode/agent/
      const agentName = file.relativePath.replace(/^agent\//, "");
      fullPath = join(AGENTS_DIR, agentName);
    } else {
      // Other files go to .opencode/skill/<name>/
      fullPath = join(skillDir, file.relativePath);
    }

    const dir = dirname(fullPath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Write file
    await Bun.write(fullPath, file.content);
    installedPaths.push(fullPath);
  }

  return installedPaths;
}

export async function skillExists(skillName: string): Promise<boolean> {
  const skillPath = join(SKILLS_DIR, skillName, "SKILL.md");
  const file = Bun.file(skillPath);
  return file.exists();
}

export async function fetchAllSkills(
  registries: string[]
): Promise<SkillWithRegistry[]> {
  const allSkills: SkillWithRegistry[] = [];

  for (const registryUrl of registries) {
    try {
      const registry = await fetchRegistry(registryUrl);
      for (const skill of registry.skills) {
        allSkills.push({
          ...skill,
          registry: registryUrl,
          registryName: registry.name,
          basePath: registry.basePath,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch registry ${registryUrl}: ${message}`);
    }
  }

  return allSkills;
}

// ============================================================================
// Agent Functions
// ============================================================================

/**
 * Fetch all agents from all configured registries
 */
export async function fetchAllAgents(
  registries: string[]
): Promise<AgentWithRegistry[]> {
  const allAgents: AgentWithRegistry[] = [];

  for (const registryUrl of registries) {
    try {
      const registry = await fetchRegistry(registryUrl);
      for (const agent of registry.agents ?? []) {
        allAgents.push({
          ...agent,
          registry: registryUrl,
          registryName: registry.name,
          basePath: registry.basePath,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch registry ${registryUrl}: ${message}`);
    }
  }

  return allAgents;
}

/**
 * Fetch all files for an agent using the registry manifest.
 */
export async function fetchAgentFiles(
  registryUrl: string,
  agent: AgentWithRegistry
): Promise<FileToInstall[]> {
  const files: FileToInstall[] = [];
  const basePath = agent.basePath;

  for (const fileName of agent.files) {
    try {
      const content = await fetchFile(
        registryUrl,
        `agents/${agent.name}/${fileName}`,
        basePath
      );
      files.push({ relativePath: fileName, content });
    } catch {
      // Skip if file fetch fails (but agent.md is required)
      if (fileName === "agent.md") {
        throw new Error(`Failed to fetch required file: agents/${agent.name}/agent.md`);
      }
    }
  }

  return files;
}

/**
 * Check if an agent file exists locally
 */
export async function agentExists(agentName: string): Promise<boolean> {
  const agentPath = join(AGENTS_DIR, `${agentName}.md`);
  const file = Bun.file(agentPath);
  return file.exists();
}

/**
 * Install an agent file to .opencode/agent/<name>.md
 */
export async function installAgentFile(
  agentName: string,
  content: string
): Promise<string> {
  await mkdir(AGENTS_DIR, { recursive: true });
  const agentPath = join(AGENTS_DIR, `${agentName}.md`);
  await Bun.write(agentPath, content);
  return agentPath;
}

// ============================================================================
// Package.json Functions
// ============================================================================

/**
 * Read and parse the user's package.json
 */
export async function readPackageJson(): Promise<Record<string, unknown> | null> {
  const file = Bun.file("package.json");
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Update package.json with new devDependencies
 * Returns list of newly added dependencies
 */
export async function updatePackageJson(
  newDeps: Record<string, string>
): Promise<string[]> {
  const pkg = (await readPackageJson()) ?? { type: "module" };
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  const added: string[] = [];

  for (const [name, version] of Object.entries(newDeps)) {
    if (!devDeps[name]) {
      devDeps[name] = version;
      added.push(`${name}@${version}`);
    }
  }

  if (added.length > 0) {
    pkg.devDependencies = devDeps;
    await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n");
  }

  return added;
}
