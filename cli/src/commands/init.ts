import { confirm } from "@inquirer/prompts";
import {
  configExists,
  createDefaultConfig,
  writeConfig,
} from "../lib/config.ts";
import { fetchUtilFile } from "../lib/registry.ts";
import { SKILLS_DIR, CONFIG_FILE, DEFAULT_REGISTRY } from "../types.ts";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const PACKAGE_JSON = "package.json";

export async function init(): Promise<void> {
  console.log("\nInitializing skillz...\n");

  // Check if config already exists
  if (await configExists()) {
    const overwrite = await confirm({
      message: `${CONFIG_FILE} already exists. Overwrite?`,
      default: false,
    });

    if (!overwrite) {
      console.log("Aborted.");
      return;
    }
  }

  // Create default config
  const config = createDefaultConfig();
  await writeConfig(config);
  console.log(`Created ${CONFIG_FILE}`);

  // Create skills directory
  await mkdir(SKILLS_DIR, { recursive: true });
  console.log(`Created ${SKILLS_DIR}/`);

  // Create utils directory and copy base utils
  const utilsDir = config.utils;
  await mkdir(utilsDir, { recursive: true });
  console.log(`Created ${utilsDir}/`);

  // Fetch and install base utils.ts
  try {
    const utilsContent = await fetchUtilFile(DEFAULT_REGISTRY, "utils.ts");
    const utilsPath = join(utilsDir, "utils.ts");
    await Bun.write(utilsPath, utilsContent);
    console.log(`Created ${utilsPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: Could not fetch utils.ts: ${message}`);
    console.log("You may need to create utils/utils.ts manually.");
  }

  // Create or update package.json
  const pkgFile = Bun.file(PACKAGE_JSON);
  let pkg: Record<string, unknown> = { type: "module" };
  let created = false;

  if (await pkgFile.exists()) {
    try {
      pkg = (await pkgFile.json()) as Record<string, unknown>;
    } catch {
      // If we can't parse it, start fresh
    }
  } else {
    created = true;
  }

  // Ensure type: module
  pkg.type = "module";

  // Add @types/bun to devDependencies
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  if (!devDeps["@types/bun"]) {
    devDeps["@types/bun"] = "latest";
    pkg.devDependencies = devDeps;
  }

  await Bun.write(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${created ? "Created" : "Updated"} ${PACKAGE_JSON}`);

  console.log("\nDone! Run `bun install` to install dependencies.\n");
  console.log("You can now use:");
  console.log("  skz list        - List available skills");
  console.log("  skz add <name>  - Add a skill to your project\n");
}
