import { checkbox, confirm } from "@inquirer/prompts";
import { readConfig } from "../lib/config.ts";
import {
  fetchAllSkills,
  fetchSkillFiles,
  fetchSkillJson,
  fetchUtilFile,
  installSkillFiles,
  installUtil,
  skillExists,
  updatePackageJson,
  utilExists,
  type SkillWithRegistry,
} from "../lib/registry.ts";

export async function add(skillNames: string[]): Promise<void> {
  const config = await readConfig();

  if (!config) {
    console.error("No skz.json found. Run `skillz init` first.");
    process.exit(1);
  }

  console.log("\nFetching skills from registries...\n");

  const allSkills = await fetchAllSkills(config.registries);

  if (allSkills.length === 0) {
    console.log("No skills found in configured registries.");
    return;
  }

  let skillsToInstall: SkillWithRegistry[] = [];

  if (skillNames.length === 0) {
    // Interactive mode - show picker
    const choices = allSkills.map((skill) => ({
      name: `${skill.name} (v${skill.version}) - ${skill.description}`,
      value: skill,
    }));

    const selected = await checkbox({
      message: "Select skills to install:",
      choices,
    });

    if (selected.length === 0) {
      console.log("No skills selected.");
      return;
    }

    skillsToInstall = selected;
  } else {
    // Find requested skills
    for (const name of skillNames) {
      const skill = allSkills.find((s) => s.name === name);
      if (!skill) {
        console.error(`Skill not found: ${name}`);
        console.log(
          "Available skills:",
          allSkills.map((s) => s.name).join(", ")
        );
        process.exit(1);
      }
      skillsToInstall.push(skill);
    }
  }

  // Track what we add across all skills
  const allAddedUtils: string[] = [];
  const allAddedDeps: string[] = [];

  // Install each skill
  let installed = 0;
  let skipped = 0;

  for (const skill of skillsToInstall) {
    const exists = await skillExists(skill.name);

    if (exists) {
      const overwrite = await confirm({
        message: `Skill '${skill.name}' already exists. Overwrite?`,
        default: false,
      });

      if (!overwrite) {
        console.log(`  Skipped ${skill.name}`);
        skipped++;
        continue;
      }
    }

    try {
      console.log(`  Installing ${skill.name}...`);

      // Fetch skill.json to get utils and dependencies
      const skillJson = await fetchSkillJson(skill.registry, skill.name);

      // Install required utils (skip if exists)
      if (skillJson?.utils) {
        for (const utilName of skillJson.utils) {
          const utilPath = `${utilName}.ts`;
          const exists = await utilExists(config.utils, utilPath);

          if (!exists) {
            try {
              const content = await fetchUtilFile(skill.registry, utilPath);
              await installUtil(config.utils, utilPath, content);
              allAddedUtils.push(utilPath);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              console.error(`    Warning: Could not fetch util ${utilPath}: ${message}`);
            }
          }
        }
      }

      // Add dependencies to package.json
      if (skillJson?.dependencies) {
        const added = await updatePackageJson(skillJson.dependencies);
        allAddedDeps.push(...added);
      }

      // Fetch all files for the skill (SKILL.md + entry files with transformed imports)
      const files = await fetchSkillFiles(skill.registry, skill.name);

      // Install all files
      const installedPaths = await installSkillFiles(skill.name, files);

      console.log(`  Installed ${skill.name} (${installedPaths.length} files)`);
      installed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to install ${skill.name}: ${message}`);
    }
  }

  // Print summary
  console.log(`\nDone! ${installed} installed, ${skipped} skipped.`);

  if (allAddedUtils.length > 0) {
    console.log(`\nAdded utils: ${allAddedUtils.join(", ")}`);
  }

  if (allAddedDeps.length > 0) {
    console.log(`Added dependencies: ${allAddedDeps.join(", ")}`);
    console.log("\nRun `bun install` to install dependencies.");
  }

  console.log();
}
