export interface SkzConfig {
  $schema?: string;
  registries: string[];
  utils: string;
  target?: SkillTarget;
}

/** File manifest for a skill - all paths relative to skills/<name>/ */
export interface SkillFiles {
  /** Core skill files (e.g., ["SKILL.md"]) */
  skill: string[];
  /** Command files: command name -> list of files (e.g., { "code_review": ["command.md"] }) */
  commands?: Record<string, string[]>;
  /** Agent files (e.g., ["reviewer.md"]) - relative to agent/ */
  agents?: string[];
  /** Entry point files: output name -> source path (e.g., { "reviewer": "src/code-review/reviewer.ts" }) */
  entry?: Record<string, string>;
  /** Additional static files (e.g., ["schema.yaml", "README.md"]) */
  static?: string[];
}

/** Skill entry in registry with full metadata and file manifest */
export interface RegistrySkill {
  name: string;
  description: string;
  version: string;
  domain?: string;
  /** Required skills that should be installed alongside this one */
  requires?: string[];
  /** Required utils (e.g., ["utils.ts", "linear.ts"]) */
  utils?: string[];
  /** NPM dependencies (e.g., { "@linear/sdk": "^29.0.0" }) */
  dependencies?: Record<string, string>;
  /** Setup requirements (env vars, instructions, prompts) */
  setup?: SkillSetup;
  /** Complete file manifest for CDN hosting */
  files: SkillFiles;
}

/** Agent entry in registry with full metadata */
export interface RegistryAgent {
  name: string;
  description: string;
  version: string;
  /** Files in agents/<name>/ directory (e.g., ["agent.md", "agent.json"]) */
  files: string[];
  /** Required MCP servers */
  mcp?: Record<string, McpConfig>;
  /** Required skills to install */
  skills?: string[];
  /** Demo video filename (e.g., "demo.mp4") */
  demo?: string;
}

/** Registry format v2 - CDN-friendly with file manifests */
export interface Registry {
  name: string;
  /** Semver version of the registry (required for v2) */
  version: string;
  /** Base path for all file fetches (e.g., "registry"). Defaults to "" */
  basePath?: string;
  skills: RegistrySkill[];
  agents?: RegistryAgent[];
  /** All available util files (e.g., ["utils.ts", "linear.ts"]) */
  utils?: string[];
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

export interface SetupPromptChoice {
  /** Value to store in config */
  value: string;
  /** Display name (defaults to value) */
  name?: string;
  /** Whether this choice is selected by default (for checkbox) */
  checked?: boolean;
}

export interface SetupPrompt {
  /** Key in output config */
  name: string;
  /** Prompt type */
  type: "input" | "select" | "checkbox" | "confirm";
  /** Question to display */
  message: string;
  /** Default value */
  default?: string | boolean;
  /** Choices for select/checkbox types */
  choices?: SetupPromptChoice[] | string[];
}

export interface SkillSetup {
  /** Required environment variables */
  env?: string[];
  /** Setup instructions to display after install */
  instructions?: string;
  /** Interactive prompts to run during setup */
  prompts?: SetupPrompt[];
  /** Where to write prompt answers (e.g., ".opencode/compound-docs.yaml") */
  configFile?: string;
}

export interface SkillJson {
  /** Domain for grouping skills (e.g., "linear", "browser", "database") */
  domain?: string;
  /** Entry points: output name -> source file path */
  entry?: Record<string, string>;
  /** Additional files to include (e.g., ["schema.yaml", "templates/doc.md"]) */
  files?: string[];
  /** Required utils (e.g., ["utils", "linear"]) */
  utils?: string[];
  /** NPM dependencies (e.g., { "@linear/sdk": "^29.0.0" }) */
  dependencies?: Record<string, string>;
  /** Setup requirements (env vars, instructions) */
  setup?: SkillSetup;
  /** Required skills that should be installed alongside this one */
  requires?: string[];
  /** Commands to install (from command/<name>/command.md) */
  commands?: string[];
  /** Agents to install (from agent/<name>.md) */
  agents?: string[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  version: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
}

export const DEFAULT_REGISTRY = "http://skillz.sh";
export const DEFAULT_UTILS_DIR = "./utils";
export const OPENCODE_DIR = ".opencode";
export const CONFIG_FILE = "skz.json";
export const NEW_CONFIG_PATH = ".opencode/skz.json";
export const LEGACY_CONFIG_PATH = "skz.json";
export const SKILLS_DIR = ".opencode/skill";
export const COMMANDS_DIR = ".opencode/command";
export const AGENTS_DIR = ".opencode/agent";
export const OPENCODE_CONFIG_FILE = "opencode.json";

export const CLAUDE_DIR = ".claude";
export const CLAUDE_SKILLS_DIR = ".claude/skills";
export const CLAUDE_CONFIG_PATH = ".claude/skz.json";

export type SkillTarget = "opencode" | "claude" | "auto";
