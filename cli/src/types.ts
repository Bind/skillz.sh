export interface SkzConfig {
  $schema?: string;
  registries: string[];
  utils: string;
}

export interface RegistrySkill {
  name: string;
  description: string;
  version: string;
}

export interface Registry {
  name: string;
  skills: RegistrySkill[];
}

export interface SkillJson {
  /** Entry points: output name -> source file path */
  entry: Record<string, string>;
  /** Required utils (e.g., ["utils", "linear"]) */
  utils?: string[];
  /** NPM dependencies (e.g., { "@linear/sdk": "^29.0.0" }) */
  dependencies?: Record<string, string>;
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
export const DEFAULT_UTILS_DIR = "utils";
export const CONFIG_FILE = "skz.json";
export const SKILLS_DIR = ".opencode/skill";
