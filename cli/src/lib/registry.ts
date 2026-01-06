import { fetchFile, fetchJson, fetchDirectoryFiles } from "./github.ts";
import {
  SKILLS_DIR,
  AGENTS_DIR,
  type Registry,
  type RegistrySkill,
  type RegistryAgent,
  type SkillJson,
  type AgentJson,
} from "../types.ts";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export async function fetchRegistry(registryUrl: string): Promise<Registry> {
  return fetchJson<Registry>(registryUrl, "registry.json");
}

export interface FileToInstall {
  /** Path relative to skill install directory */
  relativePath: string;
  content: string;
}

/**
 * Fetches skill.json for a skill from skills/<name>/skill.json
 */
export async function fetchSkillJson(
  registryUrl: string,
  skillName: string
): Promise<SkillJson | null> {
  try {
    return await fetchJson<SkillJson>(
      registryUrl,
      `skills/${skillName}/skill.json`
    );
  } catch {
    return null;
  }
}

/**
 * Fetches a single util file from utils/
 */
export async function fetchUtilFile(
  registryUrl: string,
  utilPath: string
): Promise<string> {
  return fetchFile(registryUrl, `utils/${utilPath}`);
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
 * Check if a registry URL is http(s) format (not github: format)
 */
function isHttpRegistry(registry: string): boolean {
  return registry.startsWith("http://") || registry.startsWith("https://");
}

/**
 * Fetches all files for a skill:
 * - SKILL.md from skills/<name>/
 * - Entry files from paths specified in skill.json (with import transformation)
 * - Additional files from skill.json files array
 * - Command files from skills/<name>/command/
 * - Agent files from skills/<name>/agent/
 *
 * @param isLegacyConfig - If true, transforms imports for legacy config location
 */
export async function fetchSkillFiles(
  registryUrl: string,
  skillName: string,
  isLegacyConfig: boolean = false
): Promise<FileToInstall[]> {
  const files: FileToInstall[] = [];

  // Fetch SKILL.md
  const skillMdContent = await fetchFile(
    registryUrl,
    `skills/${skillName}/SKILL.md`
  );
  files.push({ relativePath: "SKILL.md", content: skillMdContent });

  // Fetch skill.json to get entry points and additional files
  const skillJson = await fetchSkillJson(registryUrl, skillName);

  if (skillJson?.entry) {
    for (const [outputName, sourcePath] of Object.entries(skillJson.entry)) {
      const content = await fetchFile(registryUrl, sourcePath);
      const transformedContent = transformImports(content, isLegacyConfig);
      files.push({
        relativePath: `${outputName}.ts`,
        content: transformedContent,
      });
    }
  }

  // Fetch additional files listed in skill.json files array
  if (skillJson?.files) {
    for (const filePath of skillJson.files) {
      try {
        const content = await fetchFile(registryUrl, `skills/${skillName}/${filePath}`);
        // Transform content for OpenCode (remove allowed-tools)
        const transformedContent = transformForOpenCode(content);
        files.push({
          relativePath: filePath,
          content: transformedContent,
        });
      } catch {
        // Skip if file fetch fails
      }
    }
  }

  // For github: format registries, also fetch command/agent directories via GitHub API
  // This provides backward compatibility for skills that don't use the files array
  if (!isHttpRegistry(registryUrl)) {
    // Fetch command files
    try {
      const commandDirContent = await fetchDirectoryFiles(
        registryUrl,
        `skills/${skillName}/command`
      );
      for (const file of commandDirContent) {
        const parts = file.relativePath.split("/");
        const commandName = parts[0];
        const fileName = parts.slice(1).join("/");

        const transformedContent = transformForOpenCode(file.content);

        files.push({
          relativePath: `command/${commandName}/${fileName}`,
          content: transformedContent,
        });
      }
    } catch {
      // No command directory, skip
    }

    // Fetch agent files
    try {
      const agentDirContent = await fetchDirectoryFiles(
        registryUrl,
        `skills/${skillName}/agent`
      );
      for (const file of agentDirContent) {
        const parts = file.relativePath.split("/");
        const fileName = parts[parts.length - 1];

        files.push({
          relativePath: `agent/${fileName}`,
          content: file.content,
        });
      }
    } catch {
      // No agent directory, skip
    }
  }

  return files;
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
 * Fetches all files for a Claude skill:
 * - SKILL.md from skills/<name>/
 * - Entry files from paths specified in skill.json (no import transformation)
 * - Command files from skills/<name>/command/
 * - Agent files from skills/<name>/agent/
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
  skillName: string
): Promise<FileToInstall[]> {
  const files: FileToInstall[] = [];

  const skillMdContent = await fetchFile(
    registryUrl,
    `skills/${skillName}/SKILL.md`
  );
  // Transform for Claude Code (AGENTS.md -> CLAUDE.md)
  files.push({ relativePath: "SKILL.md", content: transformForClaude(skillMdContent) });

  const skillJson = await fetchSkillJson(registryUrl, skillName);

  if (skillJson?.entry) {
    for (const [outputName, sourcePath] of Object.entries(skillJson.entry)) {
      const content = await fetchFile(registryUrl, sourcePath);
      // Transform source files too
      files.push({
        relativePath: `${outputName}.ts`,
        content: transformForClaude(content),
      });
    }
  }

  // Fetch command files (transformed for Claude Code)
  try {
    const commandDirContent = await fetchDirectoryFiles(
      registryUrl,
      `skills/${skillName}/command`
    );
    for (const file of commandDirContent) {
      // Get the command subdirectory name (e.g., "code_review" from "command/code_review/...")
      const parts = file.relativePath.split("/");
      const commandName = parts[0];
      const fileName = parts.slice(1).join("/");

      // Transform content (AGENTS.md -> CLAUDE.md, remove agent: for Claude)
      const transformedContent = transformForClaude(file.content);

      files.push({
        relativePath: `command/${commandName}/${fileName}`,
        content: transformedContent,
      });
    }
  } catch {
    // No command directory, skip
  }

  // Fetch agent files (transformed for Claude Code)
  try {
    const agentDirContent = await fetchDirectoryFiles(
      registryUrl,
      `skills/${skillName}/agent`
    );
    for (const file of agentDirContent) {
      // Get the agent file name (e.g., "reviewer.md" from "agent/reviewer.md")
      const parts = file.relativePath.split("/");
      const fileName = parts[parts.length - 1];

      files.push({
        relativePath: `agent/${fileName}`,
        content: transformForClaude(file.content),
      });
    }
  } catch {
    // No agent directory, skip
  }

  return files;
}

/**
 * Installs a skill with all its files into .opencode/skill/<name>/
 */
export async function installSkillFiles(
  skillName: string,
  files: FileToInstall[]
): Promise<string[]> {
  const skillDir = join(SKILLS_DIR, skillName);
  const installedPaths: string[] = [];

  for (const file of files) {
    const fullPath = join(skillDir, file.relativePath);
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

export interface SkillWithRegistry extends RegistrySkill {
  registry: string;
  registryName: string;
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

export interface AgentWithRegistry extends RegistryAgent {
  registry: string;
  registryName: string;
}

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
 * Fetch agent.md file from agents/<name>/agent.md
 */
export async function fetchAgentFile(
  registryUrl: string,
  agentName: string
): Promise<string> {
  return fetchFile(registryUrl, `agents/${agentName}/agent.md`);
}

/**
 * Fetch agent.json for an agent from agents/<name>/agent.json
 */
export async function fetchAgentJson(
  registryUrl: string,
  agentName: string
): Promise<AgentJson | null> {
  try {
    return await fetchJson<AgentJson>(
      registryUrl,
      `agents/${agentName}/agent.json`
    );
  } catch {
    return null;
  }
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
