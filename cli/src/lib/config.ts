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
  /** Path to the config file (e.g., ".opencode/skz.json" or ".claude/skz.json") */
  configPath: string;
  /** Directory containing the config (e.g., ".opencode" or ".claude") */
  configDir: string;
  /** Resolved path to utils directory */
  utilsPath: string;
  /** True if using legacy location (./skz.json) */
  isLegacy: boolean;
  /** True if using Claude location (.claude/skz.json) */
  isClaude: boolean;
}

/**
 * Find and read config from known locations.
 * Checks in order: .opencode/skz.json, .claude/skz.json, ./skz.json (legacy)
 */
export async function findConfig(): Promise<ConfigResult | null> {
  const locations = [
    { path: NEW_CONFIG_PATH, isLegacy: false, isClaude: false },
    { path: CLAUDE_CONFIG_PATH, isLegacy: false, isClaude: true },
    { path: LEGACY_CONFIG_PATH, isLegacy: true, isClaude: false },
  ];

  for (const loc of locations) {
    const file = Bun.file(loc.path);
    if (await file.exists()) {
      try {
        const config = (await file.json()) as SkzConfig;
        const configDir = dirname(loc.path);
        const utilsPath = resolve(configDir, config.utils);

        return {
          config,
          configPath: loc.path,
          configDir,
          utilsPath,
          isLegacy: loc.isLegacy,
          isClaude: loc.isClaude,
        };
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Read config (backward compatible - returns just the config object)
 */
export async function readConfig(): Promise<SkzConfig | null> {
  const result = await findConfig();
  return result?.config ?? null;
}

/**
 * Check if any config exists (opencode, claude, or legacy location)
 */
export async function configExists(): Promise<boolean> {
  const locations = [NEW_CONFIG_PATH, CLAUDE_CONFIG_PATH, LEGACY_CONFIG_PATH];
  for (const path of locations) {
    if (await Bun.file(path).exists()) return true;
  }
  return false;
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
