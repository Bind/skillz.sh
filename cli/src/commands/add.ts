import { checkbox, confirm } from "@inquirer/prompts";
import { findConfig } from "../lib/config.ts";
import {
  fetchAllSkills,
  fetchSkillFiles,
  fetchSkillJson,
  fetchUtilFile,
  fetchClaudeSkillFiles,
  installSkillFiles,
  installUtil,
  skillExists,
  updatePackageJson,
  utilExists,
  type SkillWithRegistry,
} from "../lib/registry.ts";
import { detectProjectConfig } from "../lib/detect.ts";
import {
  installClaudeSkill,
  claudeSkillExists,
  ensureClaudeSkillsDir,
} from "../lib/claude.ts";

export async function add(skillNames: string[]): Promise<void> {
  const configResult = await findConfig();

  if (!configResult) {
    console.error("No skz.json found. Run `skz init` first.");
    process.exit(1);
  }

  const { config, utilsPath, isLegacy } = configResult;

  const { target } = await detectProjectConfig();

  if (target === "claude") {
    await addClaudeSkills(skillNames, config);
  } else {
    await addOpenCodeSkills(skillNames, config, utilsPath, isLegacy);
  }
}

async function addOpenCodeSkills(
  skillNames: string[],
  config: { registries: string[] },
  utilsPath: string,
  isLegacy: boolean
): Promise<void> {
  console.log("\nFetching skills from registries...\n");

  const allSkills = await fetchAllSkills(config.registries);

  if (allSkills.length === 0) {
    console.log("No skills found in configured registries.");
    return;
  }

  let skillsToInstall: SkillWithRegistry[] = [];

  if (skillNames.length === 0) {
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

  const allAddedUtils: string[] = [];
  const allAddedDeps: string[] = [];

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

      const skillJson = await fetchSkillJson(skill.registry, skill.name);

      if (skillJson?.utils) {
        for (const utilName of skillJson.utils) {
          const utilPath = `${utilName}.ts`;
          const exists = await utilExists(utilsPath, utilPath);

          if (!exists) {
            try {
              const content = await fetchUtilFile(skill.registry, utilPath);
              await installUtil(utilsPath, utilPath, content);
              allAddedUtils.push(utilPath);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              console.error(`    Warning: Could not fetch util ${utilPath}: ${message}`);
            }
          }
        }
      }

      if (skillJson?.dependencies) {
        const added = await updatePackageJson(skillJson.dependencies);
        allAddedDeps.push(...added);
      }

      const files = await fetchSkillFiles(skill.registry, skill.name, isLegacy);
      const installedPaths = await installSkillFiles(skill.name, files);

      console.log(`  Installed ${skill.name} (${installedPaths.length} files)`);
      installed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to install ${skill.name}: ${message}`);
    }
  }

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

async function addClaudeSkills(
  skillNames: string[],
  config: { registries: string[] }
): Promise<void> {
  await ensureClaudeSkillsDir();

  console.log("\nFetching skills from registries...\n");

  const allSkills = await fetchAllSkills(config.registries);

  if (allSkills.length === 0) {
    console.log("No skills found in configured registries.");
    return;
  }

  let skillsToInstall: SkillWithRegistry[] = [];

  if (skillNames.length === 0) {
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

  const allAddedDeps: string[] = [];

  let installed = 0;
  let skipped = 0;

  for (const skill of skillsToInstall) {
    const exists = await claudeSkillExists(skill.name);

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
      console.log(`  Installing ${skill.name} to .claude/skills/...`);

      const skillJson = await fetchSkillJson(skill.registry, skill.name);

      if (skillJson?.dependencies) {
        const added = await updatePackageJson(skillJson.dependencies);
        allAddedDeps.push(...added);
      }

      const files = await fetchClaudeSkillFiles(skill.registry, skill.name);
      const installedPaths = await installClaudeSkill(skill.name, files, skillJson ?? undefined);

      console.log(`  Installed ${skill.name} (${installedPaths.length} files)`);
      installed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to install ${skill.name}: ${message}`);
    }
  }

  console.log(`\nDone! ${installed} installed, ${skipped} skipped.`);
  console.log("Skills installed to .claude/skills/");

  if (allAddedDeps.length > 0) {
    console.log(`\nAdded dependencies: ${allAddedDeps.join(", ")}`);
    console.log("Run `bun install` to install dependencies.");
  }

  console.log();
}
