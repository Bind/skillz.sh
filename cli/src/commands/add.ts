import { checkbox, confirm, select } from "@inquirer/prompts";
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
  addClaudeSkillPermissions,
} from "../lib/claude.ts";

/**
 * Resolve skill dependencies recursively.
 * Returns skills in dependency order (dependencies first).
 */
async function resolveSkillDependencies(
  skills: SkillWithRegistry[],
  allSkills: SkillWithRegistry[],
  registries: string[]
): Promise<SkillWithRegistry[]> {
  const resolved: SkillWithRegistry[] = [];
  const seen = new Set<string>();

  async function resolve(skill: SkillWithRegistry): Promise<void> {
    if (seen.has(skill.name)) return;
    seen.add(skill.name);

    // Check for dependencies in skill.json
    const skillJson = await fetchSkillJson(skill.registry, skill.name);
    if (skillJson?.requires) {
      for (const depName of skillJson.requires) {
        // Find the dependency in available skills
        const dep = allSkills.find((s) => s.name === depName);
        if (dep) {
          await resolve(dep);
        } else {
          console.warn(`  Warning: Required skill '${depName}' not found in registries`);
        }
      }
    }

    resolved.push(skill);
  }

  for (const skill of skills) {
    await resolve(skill);
  }

  return resolved;
}

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

  // Group skills by domain (used for both interactive and domain-name modes)
  const grouped = new Map<string, SkillWithRegistry[]>();
  for (const skill of allSkills) {
    const domain = skill.domain ?? "other";
    const list = grouped.get(domain) ?? [];
    list.push(skill);
    grouped.set(domain, list);
  }

  // Sort domains alphabetically, "other" last
  const domains = [...grouped.keys()].sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  });

  if (skillNames.length === 0) {
    // Step 1: Select a domain
    const domainChoices = domains.map((domain) => {
      const skills = grouped.get(domain)!;
      return {
        name: `${domain} (${skills.length} skill${skills.length === 1 ? "" : "s"})`,
        value: domain,
      };
    });

    const selectedDomain = await select({
      message: "Select a domain:",
      choices: domainChoices,
    });

    // Step 2: Select skills from that domain (all checked by default)
    const domainSkills = grouped.get(selectedDomain)!;
    const skillChoices = domainSkills.map((skill) => ({
      name: `${skill.name} - ${skill.description}`,
      value: skill,
      checked: true,
    }));

    const selected = await checkbox({
      message: `Select ${selectedDomain} skills to install:`,
      choices: skillChoices,
    });

    if (selected.length === 0) {
      console.log("No skills selected.");
      return;
    }

    skillsToInstall = selected;
  } else if (skillNames.length === 1 && domains.includes(skillNames[0]!)) {
    // Domain name passed: install all skills in that domain
    const domainName = skillNames[0]!;
    skillsToInstall = grouped.get(domainName)!;
    console.log(`Installing all ${domainName} skills...`);
  } else {
    // Skill names passed: find each skill
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

  // Resolve dependencies (adds required skills in correct order)
  skillsToInstall = await resolveSkillDependencies(
    skillsToInstall,
    allSkills,
    config.registries
  );

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
  args: string[],
  config: { registries: string[] }
): Promise<void> {
  await ensureClaudeSkillsDir();

  console.log("\nFetching skills from registries...\n");

  const allSkills = await fetchAllSkills(config.registries);

  if (allSkills.length === 0) {
    console.log("No skills found in configured registries.");
    return;
  }

  // Group skills by domain
  const grouped = new Map<string, SkillWithRegistry[]>();
  for (const skill of allSkills) {
    const domain = skill.domain ?? "other";
    const list = grouped.get(domain) ?? [];
    list.push(skill);
    grouped.set(domain, list);
  }

  const domains = [...grouped.keys()];

  let skillsToInstall: SkillWithRegistry[] = [];

  if (args.length === 0) {
    // Interactive mode: select domain then skills
    
    // Sort domains alphabetically, "other" last
    const sortedDomains = domains.sort((a, b) => {
      if (a === "other") return 1;
      if (b === "other") return -1;
      return a.localeCompare(b);
    });

    // Step 1: Select a domain
    const domainChoices = sortedDomains.map((domain) => {
      const skills = grouped.get(domain)!;
      return {
        name: `${domain} (${skills.length} skill${skills.length === 1 ? "" : "s"})`,
        value: domain,
      };
    });

    const selectedDomain = await select({
      message: "Select a domain:",
      choices: domainChoices,
    });

    // Step 2: Select skills from that domain (all checked by default)
    const domainSkills = grouped.get(selectedDomain)!;
    const skillChoices = domainSkills.map((skill) => ({
      name: `${skill.name} - ${skill.description}`,
      value: skill,
      checked: true,
    }));

    const selected = await checkbox({
      message: `Select ${selectedDomain} skills to install:`,
      choices: skillChoices,
    });

    if (selected.length === 0) {
      console.log("No skills selected.");
      return;
    }

    skillsToInstall = selected;
  } else if (args.length === 1 && domains.includes(args[0]!)) {
    // Domain name passed: install all skills in that domain
    const domainName = args[0]!;
    skillsToInstall = grouped.get(domainName)!;
    console.log(`Installing all ${domainName} skills...`);
  } else {
    // Skill names passed: find each skill
    for (const name of args) {
      const skill = allSkills.find((s) => s.name === name);
      if (!skill) {
        console.error(`Skill not found: ${name}`);
        console.log(
          "Available skills:",
          allSkills.map((s) => s.name).join(", ")
        );
        console.log(
          "Available domains:",
          domains.join(", ")
        );
        process.exit(1);
      }
      skillsToInstall.push(skill);
    }
  }

  // Resolve dependencies (adds required skills in correct order)
  skillsToInstall = await resolveSkillDependencies(
    skillsToInstall,
    allSkills,
    config.registries
  );

  const allAddedDeps: string[] = [];
  const requiredEnvVars = new Set<string>();
  const setupInstructions = new Set<string>();
  const installedSkillNames: string[] = [];

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

      // Collect setup requirements
      if (skillJson?.setup?.env) {
        for (const envVar of skillJson.setup.env) {
          requiredEnvVars.add(envVar);
        }
      }
      if (skillJson?.setup?.instructions) {
        setupInstructions.add(skillJson.setup.instructions);
      }

      const files = await fetchClaudeSkillFiles(skill.registry, skill.name);
      const installedPaths = await installClaudeSkill(skill.name, files, skillJson ?? undefined);

      console.log(`  Installed ${skill.name} (${installedPaths.length} files)`);
      installedSkillNames.push(skill.name);
      installed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to install ${skill.name}: ${message}`);
    }
  }

  console.log(`\nDone! ${installed} installed, ${skipped} skipped.`);
  console.log("Skills installed to .claude/skills/");

  // Configure permissions for installed skills
  if (installed > 0) {
    await addClaudeSkillPermissions(installedSkillNames);
    
    const readSkills = installedSkillNames.filter((n) => n.endsWith("-read"));
    const writeSkills = installedSkillNames.filter((n) => n.endsWith("-write"));
    const otherSkills = installedSkillNames.filter((n) => !n.endsWith("-read") && !n.endsWith("-write"));
    
    console.log("\nPermissions configured in .claude/settings.json:");
    if (readSkills.length > 0) {
      console.log(`  allow: ${readSkills.join(", ")}`);
    }
    if (writeSkills.length > 0 || otherSkills.length > 0) {
      console.log(`  ask: ${[...writeSkills, ...otherSkills].join(", ")}`);
    }
  }

  // Display setup requirements
  if (requiredEnvVars.size > 0) {
    console.log("\nRequired environment variables:");
    for (const envVar of requiredEnvVars) {
      console.log(`  ${envVar}`);
    }
    console.log("\nAdd to your .env file or export in your shell.");
  }

  if (setupInstructions.size > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("Setup Required:");
    console.log("=".repeat(60));
    for (const instruction of setupInstructions) {
      console.log(`  ${instruction}`);
    }
    console.log("=".repeat(60) + "\n");
  }

  if (allAddedDeps.length > 0) {
    console.log(`\nAdded dependencies: ${allAddedDeps.join(", ")}`);
    console.log("Run `bun install` to install dependencies.");
  }

  console.log();
}
