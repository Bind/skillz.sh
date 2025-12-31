import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

/**
 * Agent frontmatter parsed from markdown files
 */
export interface AgentFrontmatter {
  description?: string;
  mode?: "primary" | "subagent" | "all";
  model?: string;
  temperature?: number;
  maxSteps?: number;
  disable?: boolean;
  tools?: Record<string, boolean>;
  permission?: {
    skill?: Record<string, "allow" | "deny" | "ask">;
    edit?: "allow" | "deny" | "ask";
    bash?: "allow" | "deny" | "ask" | Record<string, "allow" | "deny" | "ask">;
    webfetch?: "allow" | "deny" | "ask";
  };
}

/**
 * Represents an agent definition
 */
export interface Agent {
  name: string;
  path: string;
  location: "project" | "global";
  frontmatter: AgentFrontmatter;
  content: string;
}

/**
 * Represents an installed skill
 */
export interface InstalledSkill {
  name: string;
  path: string;
  description?: string;
  version?: string;
}

const OPENCODE_DIR = ".opencode";
const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "opencode");

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = match[1]!;
  const body = match[2] ?? "";

  try {
    const frontmatter = Bun.YAML.parse(yamlContent) as AgentFrontmatter;
    return { frontmatter: frontmatter ?? {}, body };
  } catch {
    return { frontmatter: {}, body };
  }
}

/**
 * Serialize frontmatter back to YAML
 */
function serializeFrontmatter(frontmatter: AgentFrontmatter): string {
  const yaml = Bun.YAML.stringify(frontmatter, null, 2);
  // Ensure yaml ends with newline before closing ---
  const yamlTrimmed = yaml.endsWith("\n") ? yaml : yaml + "\n";
  return `---\n${yamlTrimmed}---`;
}

/**
 * Find all agent markdown files in a directory
 */
async function findAgentsInDir(
  dir: string,
  location: "project" | "global"
): Promise<Agent[]> {
  const agents: Agent[] = [];
  const agentDir = join(dir, "agent");

  try {
    const entries = await readdir(agentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const filePath = join(agentDir, entry.name);
        const file = Bun.file(filePath);
        const content = await file.text();
        const { frontmatter, body } = parseFrontmatter(content);
        const name = basename(entry.name, ".md");

        agents.push({
          name,
          path: filePath,
          location,
          frontmatter,
          content: body,
        });
      }
    }
  } catch {
    // Directory doesn't exist, return empty array
  }

  return agents;
}

export type AgentLocation = "project" | "global" | "all";

/**
 * Get agents filtered by location
 */
export async function getAgents(location: AgentLocation = "project"): Promise<Agent[]> {
  if (location === "project") {
    return findAgentsInDir(OPENCODE_DIR, "project");
  }
  
  if (location === "global") {
    return findAgentsInDir(GLOBAL_CONFIG_DIR, "global");
  }

  // "all" - return both
  const projectAgents = await findAgentsInDir(OPENCODE_DIR, "project");
  const globalAgents = await findAgentsInDir(GLOBAL_CONFIG_DIR, "global");
  return [...projectAgents, ...globalAgents];
}

/**
 * Get a specific agent by name
 */
export async function getAgent(name: string, location: AgentLocation = "all"): Promise<Agent | null> {
  const agents = await getAgents(location);
  return agents.find((a) => a.name === name) ?? null;
}

/**
 * Find all installed skills in the project
 */
export async function getInstalledSkills(): Promise<InstalledSkill[]> {
  const skills: InstalledSkill[] = [];
  const skillDir = join(OPENCODE_DIR, "skill");

  try {
    const entries = await readdir(skillDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(skillDir, entry.name);
        const skillMdPath = join(skillPath, "SKILL.md");
        const file = Bun.file(skillMdPath);

        if (await file.exists()) {
          const content = await file.text();
          const { frontmatter } = parseFrontmatter(content);

          skills.push({
            name: entry.name,
            path: skillPath,
            description: (frontmatter as Record<string, string>).description,
            version: (frontmatter as Record<string, string>).version,
          });
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return skills;
}

/**
 * Update an agent's skill permissions
 */
export async function updateAgentSkillPermissions(
  agentName: string,
  skillPermissions: Record<string, "allow" | "deny" | "ask">
): Promise<void> {
  const agent = await getAgent(agentName);

  if (!agent) {
    throw new Error(`Agent '${agentName}' not found`);
  }

  // Update the frontmatter
  const updatedFrontmatter: AgentFrontmatter = {
    ...agent.frontmatter,
    permission: {
      ...agent.frontmatter.permission,
      skill: {
        ...agent.frontmatter.permission?.skill,
        ...skillPermissions,
      },
    },
  };

  // Serialize back to markdown
  const newContent = `${serializeFrontmatter(updatedFrontmatter)}\n${agent.content}`;

  await Bun.write(agent.path, newContent);
}

/**
 * Get skill permissions for an agent
 */
export function getAgentSkillPermissions(
  agent: Agent
): Record<string, "allow" | "deny" | "ask"> {
  return agent.frontmatter.permission?.skill ?? {};
}

/**
 * Check if a skill is enabled for an agent (not denied)
 */
export function isSkillEnabledForAgent(
  agent: Agent,
  skillName: string
): boolean {
  const permissions = getAgentSkillPermissions(agent);

  // Check exact match first
  if (permissions[skillName] !== undefined) {
    return permissions[skillName] !== "deny";
  }

  // Check wildcard patterns
  for (const [pattern, permission] of Object.entries(permissions)) {
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*") + "$"
      );
      if (regex.test(skillName)) {
        return permission !== "deny";
      }
    }
  }

  // Default to allow if no rule matches
  return true;
}
