import { confirm } from "@inquirer/prompts";
import { mkdir, readdir, rm, rmdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  findConfig,
  legacyConfigExists,
  newConfigExists,
} from "../lib/config.ts";
import {
  OPENCODE_DIR,
  SKILLS_DIR,
  NEW_CONFIG_PATH,
  LEGACY_CONFIG_PATH,
  type SkzConfig,
} from "../types.ts";

/**
 * Transform import paths in skill files from legacy to new format.
 * Legacy: ../../../utils/ (when utils was at ./utils/)
 * New: ../../utils/ (when utils is at .opencode/utils/)
 */
function transformImportsLegacyToNew(content: string): string {
  return content.replace(
    /from ["']\.\.\/\.\.\/\.\.\/utils\//g,
    'from "../../utils/'
  );
}

/**
 * Check if a directory is empty
 */
async function isDirEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath);
    return entries.length === 0;
  } catch {
    return true; // Directory doesn't exist or can't be read
  }
}

/**
 * Copy all files from source directory to destination directory
 */
async function copyDir(src: string, dest: string): Promise<string[]> {
  const copied: string[] = [];

  try {
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true });
        const subCopied = await copyDir(srcPath, destPath);
        copied.push(...subCopied);
      } else if (entry.isFile()) {
        const file = Bun.file(srcPath);
        const content = await file.text();
        await Bun.write(destPath, content);
        copied.push(entry.name);
      }
    }
  } catch {
    // Source doesn't exist or other error
  }

  return copied;
}

/**
 * Remove a directory and all its contents
 */
async function removeDir(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

/**
 * Update import paths in all installed skill files
 */
async function updateSkillImports(): Promise<number> {
  let updated = 0;

  try {
    const skillDirs = await readdir(SKILLS_DIR, { withFileTypes: true });

    for (const skillDir of skillDirs) {
      if (!skillDir.isDirectory()) continue;

      const skillPath = join(SKILLS_DIR, skillDir.name);
      const files = await readdir(skillPath, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".ts")) continue;

        const filePath = join(skillPath, file.name);
        const bunFile = Bun.file(filePath);
        const content = await bunFile.text();

        // Check if this file has legacy imports
        if (content.includes("../../../utils/")) {
          const newContent = transformImportsLegacyToNew(content);
          await Bun.write(filePath, newContent);
          updated++;
        }
      }
    }
  } catch {
    // Skills directory might not exist
  }

  return updated;
}

export async function migrate(): Promise<void> {
  console.log("\nChecking for legacy configuration...\n");

  // Check if already using new config
  const hasNewConfig = await newConfigExists();
  const hasLegacyConfig = await legacyConfigExists();

  if (hasNewConfig && !hasLegacyConfig) {
    console.log("Already using new config location (.opencode/skz.json).");
    console.log("No migration needed.");
    return;
  }

  if (hasNewConfig && hasLegacyConfig) {
    console.log("Both new and legacy configs exist!");
    console.log(`  New:    ${NEW_CONFIG_PATH}`);
    console.log(`  Legacy: ${LEGACY_CONFIG_PATH}`);
    console.log("\nPlease manually resolve this by removing one of them.");
    return;
  }

  if (!hasLegacyConfig) {
    console.log("No skz.json found. Run `skz init` to initialize.");
    return;
  }

  // We have legacy config, proceed with migration
  const configResult = await findConfig();
  if (!configResult || !configResult.isLegacy) {
    console.log("Unexpected state. Please check your configuration.");
    return;
  }

  const { config } = configResult;
  const legacyUtilsDir = config.utils;
  const newUtilsDir = join(OPENCODE_DIR, "utils");

  console.log("Found legacy configuration:");
  console.log(`  Config: ${LEGACY_CONFIG_PATH}`);
  console.log(`  Utils:  ${legacyUtilsDir}/`);
  console.log("\nWill migrate to:");
  console.log(`  Config: ${NEW_CONFIG_PATH}`);
  console.log(`  Utils:  ${newUtilsDir}/`);

  const proceed = await confirm({
    message: "Proceed with migration?",
    default: true,
  });

  if (!proceed) {
    console.log("Aborted.");
    return;
  }

  console.log("\nMigrating...\n");

  // 1. Ensure .opencode directory exists
  await mkdir(OPENCODE_DIR, { recursive: true });

  // 2. Copy utils directory if it exists at legacy location
  const legacyUtilsFile = Bun.file(join(legacyUtilsDir, "utils.ts"));
  if (await legacyUtilsFile.exists()) {
    await mkdir(newUtilsDir, { recursive: true });
    const copied = await copyDir(legacyUtilsDir, newUtilsDir);
    console.log(`Copied ${copied.length} file(s) from ${legacyUtilsDir}/ to ${newUtilsDir}/`);

    // Remove legacy utils directory if it's now empty or we copied everything
    const isEmpty = await isDirEmpty(legacyUtilsDir);
    if (!isEmpty) {
      // Check if we can safely remove it (only if it contains what we copied)
      await removeDir(legacyUtilsDir);
      console.log(`Removed ${legacyUtilsDir}/`);
    }
  }

  // 3. Update config and write to new location
  const newConfig: SkzConfig = {
    ...config,
    $schema: "https://raw.githubusercontent.com/Bind/skillz.sh/main/schema.json",
    utils: "./utils", // Update to new relative path
  };

  await mkdir(dirname(NEW_CONFIG_PATH), { recursive: true });
  await Bun.write(NEW_CONFIG_PATH, JSON.stringify(newConfig, null, 2) + "\n");
  console.log(`Created ${NEW_CONFIG_PATH}`);

  // 4. Remove legacy config
  await rm(LEGACY_CONFIG_PATH);
  console.log(`Removed ${LEGACY_CONFIG_PATH}`);

  // 5. Update import paths in installed skills
  const updatedSkills = await updateSkillImports();
  if (updatedSkills > 0) {
    console.log(`Updated imports in ${updatedSkills} skill file(s)`);
  }

  console.log("\nMigration complete!");
  console.log("\nYour project now uses the new .opencode/ directory structure:");
  console.log("  .opencode/");
  console.log("    skz.json       # Configuration");
  console.log("    utils/         # Utility files");
  console.log("    skill/         # Installed skills");
  console.log("    agent/         # Installed agents");
}
