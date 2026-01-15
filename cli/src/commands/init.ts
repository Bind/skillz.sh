import { confirm } from "@inquirer/prompts";
import {
  configExists,
  createDefaultConfig,
  writeConfig,
  writeClaudeConfig,
  claudeConfigExists,
} from "../lib/config.ts";
import { fetchRegistry, fetchUtilFile } from "../lib/registry.ts";
import { ensureClaudeSkillsDir } from "../lib/claude.ts";
import {
  OPENCODE_DIR,
  SKILLS_DIR,
  NEW_CONFIG_PATH,
  DEFAULT_REGISTRY,
  CLAUDE_DIR,
  CLAUDE_SKILLS_DIR,
  CLAUDE_CONFIG_PATH,
} from "../types.ts";

/**
 * Get the registry URL, using test registry if SKZ_TEST_REGISTRY env var is set.
 */
function getRegistryUrl(): string {
  return process.env.SKZ_TEST_REGISTRY ?? DEFAULT_REGISTRY;
}
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_JSON = "package.json";

export async function init(forceClaude: boolean = false): Promise<void> {
  const hasClaudeDir = await claudeDirExists();
  const isClaude = forceClaude || hasClaudeDir;

  console.log(`\nInitializing skillz${isClaude ? " for Claude" : ""}...\n`);

  const existingConfig = isClaude
    ? await claudeConfigExists()
    : await configExists();

  if (existingConfig) {
    const overwrite = await confirm({
      message: `Config already exists. Overwrite?`,
      default: false,
    });

    if (!overwrite) {
      console.log("Aborted.");
      return;
    }
  }

  const config = isClaude
    ? { ...createDefaultConfig(), target: "claude" as const }
    : createDefaultConfig();

  // Fetch registry to get basePath for utils
  const registryUrl = getRegistryUrl();
  let basePath: string | undefined;
  try {
    const registry = await fetchRegistry(registryUrl);
    basePath = registry.basePath;
  } catch {
    // Continue without basePath if registry fetch fails
  }

  if (isClaude) {
    await writeClaudeConfig(config);
    console.log(`Created ${CLAUDE_CONFIG_PATH}`);

    await ensureClaudeSkillsDir();
    console.log(`Created ${CLAUDE_SKILLS_DIR}/`);

    const utilsDir = join(CLAUDE_DIR, config.utils);
    await mkdir(utilsDir, { recursive: true });
    console.log(`Created ${utilsDir}/`);

    try {
      const utilsContent = await fetchUtilFile(registryUrl, "utils.ts", basePath);
      const utilsPath = join(utilsDir, "utils.ts");
      await Bun.write(utilsPath, utilsContent);
      console.log(`Created ${utilsPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Warning: Could not fetch utils.ts: ${message}`);
      console.log(`You may need to create ${utilsDir}/utils.ts manually.`);
    }
  } else {
    await writeConfig(config);
    console.log(`Created ${NEW_CONFIG_PATH}`);

    await mkdir(SKILLS_DIR, { recursive: true });
    console.log(`Created ${SKILLS_DIR}/`);

    const utilsDir = join(OPENCODE_DIR, config.utils);
    await mkdir(utilsDir, { recursive: true });
    console.log(`Created ${utilsDir}/`);

    try {
      const utilsContent = await fetchUtilFile(registryUrl, "utils.ts", basePath);
      const utilsPath = join(utilsDir, "utils.ts");
      await Bun.write(utilsPath, utilsContent);
      console.log(`Created ${utilsPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Warning: Could not fetch utils.ts: ${message}`);
      console.log(`You may need to create ${utilsDir}/utils.ts manually.`);
    }
  }

  await updatePackageJson();

  console.log("\nDone! Run `bun install` to install dependencies.\n");
  console.log("You can now use:");
  console.log("  skz list        - List available skills");
  console.log("  skz add <name>  - Add a skill to your project\n");
}

async function claudeDirExists(): Promise<boolean> {
  try {
    const stats = await stat(CLAUDE_DIR);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function updatePackageJson(): Promise<void> {
  const pkgFile = Bun.file(PACKAGE_JSON);
  let pkg: Record<string, unknown> = { type: "module" };
  let created = false;

  if (await pkgFile.exists()) {
    try {
      pkg = (await pkgFile.json()) as Record<string, unknown>;
    } catch {
    }
  } else {
    created = true;
  }

  pkg.type = "module";

  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  if (!devDeps["@types/bun"]) {
    devDeps["@types/bun"] = "latest";
    pkg.devDependencies = devDeps;
  }

  await Bun.write(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${created ? "Created" : "Updated"} ${PACKAGE_JSON}`);
}
