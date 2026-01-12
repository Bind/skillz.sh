export interface RegistrySkill {
  name: string;
  description: string;
  version: string;
  domain?: string;
  requires?: string[];
  utils?: string[];
  dependencies?: Record<string, string>;
  setup?: {
    env?: string[];
    instructions?: string;
  };
  files: {
    skill: string[];
    entry?: Record<string, string>;
  };
}

export interface RegistryAgent {
  name: string;
  description: string;
  version: string;
  files: string[];
  mcp?: Record<string, { url?: string }>;
  skills?: string[];
}

export interface Registry {
  name: string;
  version: string;
  basePath?: string;
  skills: RegistrySkill[];
  agents: RegistryAgent[];
  utils: string[];
}
