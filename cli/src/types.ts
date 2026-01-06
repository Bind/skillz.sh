export interface SkzConfig {
  $schema?: string;
  registries: string[];
  utils: string;
  target?: SkillTarget;
}

export interface RegistrySkill {
  name: string;
  description: string;
  version: string;
  domain?: string;
}

export interface RegistryAgent {
  name: string;
  description: string;
  version: string;
}

export interface Registry {
  name: string;
  skills: RegistrySkill[];
  agents?: RegistryAgent[];
}

// MCP server configuration (matches opencode.json structure)
export interface McpConfig {
  type: "local" | "remote";
  url?: string;
  command?: string[];
  headers?: Record<string, string>;
  environment?: Record<string, string>;
  enabled?: boolean;
}

// agent.json structure
export interface AgentJson {
  /** Required MCP servers to install */
  mcp?: Record<string, McpConfig>;
  /** Required skills to install */
  skills?: string[];
}

// Opencode.json structure (partial, for MCP management)
export interface OpencodeConfig {
  $schema?: string;
  mcp?: Record<string, McpConfig>;
  [key: string]: unknown;
}

export interface SkillSetup {
  /** Required environment variables */
  env?: string[];
  /** Setup instructions to display after install */
  instructions?: string;
}

export interface SkillJson {
  /** Domain for grouping skills (e.g., "linear", "browser", "database") */
  domain?: string;
  /** Entry points: output name -> source file path */
  entry: Record<string, string>;
  /** Required utils (e.g., ["utils", "linear"]) */
  utils?: string[];
  /** NPM dependencies (e.g., { "@linear/sdk": "^29.0.0" }) */
  dependencies?: Record<string, string>;
  /** Setup requirements (env vars, instructions) */
  setup?: SkillSetup;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  version: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
}

export const DEFAULT_REGISTRY = "github:Bind/skillz.sh";
export const DEFAULT_UTILS_DIR = "./utils";
export const OPENCODE_DIR = ".opencode";
export const CONFIG_FILE = "skz.json";
export const NEW_CONFIG_PATH = ".opencode/skz.json";
export const LEGACY_CONFIG_PATH = "skz.json";
export const SKILLS_DIR = ".opencode/skill";
export const AGENTS_DIR = ".opencode/agent";
export const OPENCODE_CONFIG_FILE = "opencode.json";

export const CLAUDE_DIR = ".claude";
export const CLAUDE_SKILLS_DIR = ".claude/skills";
export const CLAUDE_CONFIG_PATH = ".claude/skz.json";

export type SkillTarget = "opencode" | "claude" | "auto";
