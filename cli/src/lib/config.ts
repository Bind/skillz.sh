import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_REGISTRY,
  DEFAULT_UTILS_DIR,
  NEW_CONFIG_PATH,
  LEGACY_CONFIG_PATH,
  CLAUDE_CONFIG_PATH,
  type SkzConfig,
} from "../types.ts";

/**
 * Result from finding and reading config, includes resolved paths
 */
export interface ConfigResult {
  /** The parsed config object */
  config: SkzConfig;
  /** Path to the config file (e.g., ".opencode/skz.json") */
  configPath: string;
  /** Directory containing the config (e.g., ".opencode") */
  configDir: string;
  /** Resolved path to utils directory */
  utilsPath: string;
  /** True if using legacy location (./skz.json) */
  isLegacy: boolean;
}

/**
 * Find and read config from either new or legacy location.
 * Checks .opencode/skz.json first, then falls back to ./skz.json
 */
export async function findConfig(): Promise<ConfigResult | null> {
  // Check new location first
  let configPath = NEW_CONFIG_PATH;
  let file = Bun.file(configPath);
  let isLegacy = false;

  if (!(await file.exists())) {
    // Fall back to legacy location
    configPath = LEGACY_CONFIG_PATH;
    file = Bun.file(configPath);
    isLegacy = true;

    if (!(await file.exists())) {
      return null;
    }
  }

  try {
    const config = (await file.json()) as SkzConfig;
    const configDir = dirname(configPath);
    // Resolve utils path relative to config directory
    // For ".opencode/skz.json" with utils: "./utils" -> ".opencode/utils"
    // For "./skz.json" with utils: "utils" -> "./utils"
    const utilsPath = resolve(configDir, config.utils);

    return { config, configPath, configDir, utilsPath, isLegacy };
  } catch {
    return null;
  }
}

/**
 * Read config (backward compatible - returns just the config object)
 */
export async function readConfig(): Promise<SkzConfig | null> {
  const result = await findConfig();
  return result?.config ?? null;
}

/**
 * Check if any config exists (new or legacy location)
 */
export async function configExists(): Promise<boolean> {
  const newFile = Bun.file(NEW_CONFIG_PATH);
  if (await newFile.exists()) return true;

  const legacyFile = Bun.file(LEGACY_CONFIG_PATH);
  return legacyFile.exists();
}

/**
 * Check if legacy config exists at ./skz.json
 */
export async function legacyConfigExists(): Promise<boolean> {
  const file = Bun.file(LEGACY_CONFIG_PATH);
  return file.exists();
}

/**
 * Check if new config exists at .opencode/skz.json
 */
export async function newConfigExists(): Promise<boolean> {
  const file = Bun.file(NEW_CONFIG_PATH);
  return file.exists();
}

/**
 * Write config to new location (.opencode/skz.json)
 */
export async function writeConfig(config: SkzConfig): Promise<void> {
  await mkdir(dirname(NEW_CONFIG_PATH), { recursive: true });
  await Bun.write(NEW_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Write config to legacy location (./skz.json) - for migration only
 */
export async function writeLegacyConfig(config: SkzConfig): Promise<void> {
  await Bun.write(LEGACY_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Create default config for new projects
 */
export function createDefaultConfig(): SkzConfig {
  return {
    $schema: "https://raw.githubusercontent.com/Bind/skillz.sh/main/schema.json",
    registries: [DEFAULT_REGISTRY],
    utils: DEFAULT_UTILS_DIR,
  };
}

/**
 * Check if Claude config exists at .claude/skz.json
 */
export async function claudeConfigExists(): Promise<boolean> {
  const file = Bun.file(CLAUDE_CONFIG_PATH);
  return file.exists();
}

/**
 * Write config to Claude location (.claude/skz.json)
 */
export async function writeClaudeConfig(config: SkzConfig): Promise<void> {
  await mkdir(dirname(CLAUDE_CONFIG_PATH), { recursive: true });
  await Bun.write(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}
