import { checkbox, confirm } from "@inquirer/prompts";
import { findConfig, createDefaultConfig, writeConfig } from "../lib/config.ts";
import {
  fetchAllAgents,
  fetchAgentFiles,
  fetchAllSkills,
  fetchSkillFiles,
  fetchUtilFile,
  installAgentFile,
  installSkillFiles,
  installUtil,
  agentExists,
  skillExists,
  updatePackageJson,
  utilExists,
  type AgentWithRegistry,
} from "../lib/registry.ts";
import { addMcpServers } from "../lib/opencode-config.ts";
import { OPENCODE_DIR, SKILLS_DIR } from "../types.ts";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function agentAdd(agentNames: string[]): Promise<void> {
  let configResult = await findConfig();

  if (!configResult) {
    // Auto-initialize if no config exists
    const config = createDefaultConfig();
    await writeConfig(config);
    await mkdir(SKILLS_DIR, { recursive: true });
    const utilsDir = join(OPENCODE_DIR, config.utils);
    await mkdir(utilsDir, { recursive: true });

    // Re-read config to get the full ConfigResult
    configResult = await findConfig();
    if (!configResult) {
      console.error("Failed to initialize config.");
      process.exit(1);
    }
  }

  const { config, utilsPath, isLegacy } = configResult;

  console.log("\nFetching agents from registries...\n");

  const allAgents = await fetchAllAgents(config.registries);

  if (allAgents.length === 0) {
    console.log("No agents found in configured registries.");
    return;
  }

  let agentsToInstall: AgentWithRegistry[] = [];

  if (agentNames.length === 0) {
    // Interactive mode
    const choices = allAgents.map((agent) => ({
      name: `${agent.name} (v${agent.version}) - ${agent.description}`,
      value: agent,
    }));

    const selected = await checkbox({
      message: "Select agents to install:",
      choices,
    });

    if (selected.length === 0) {
      console.log("No agents selected.");
      return;
    }

    agentsToInstall = selected;
  } else {
    // Find requested agents
    for (const name of agentNames) {
      const agent = allAgents.find((a) => a.name === name);
      if (!agent) {
        console.error(`Agent not found: ${name}`);
        console.log(
          "Available agents:",
          allAgents.map((a) => a.name).join(", ")
        );
        process.exit(1);
      }
      agentsToInstall.push(agent);
    }
  }

  // Track what we add
  const allAddedMcp: string[] = [];
  const allAddedSkills: string[] = [];
  const allAddedDeps: string[] = [];
  let installed = 0;
  let skipped = 0;

  for (const agent of agentsToInstall) {
    const exists = await agentExists(agent.name);

    if (exists) {
      const overwrite = await confirm({
        message: `Agent '${agent.name}' already exists. Overwrite?`,
        default: false,
      });

      if (!overwrite) {
        console.log(`  Skipped ${agent.name}`);
        skipped++;
        continue;
      }
    }

    try {
      console.log(`  Installing ${agent.name}...`);

      // Install MCP servers (from registry manifest)
      if (agent.mcp) {
        const addedMcp = await addMcpServers(agent.mcp);
        allAddedMcp.push(...addedMcp);
      }

      // Install required skills (from registry manifest)
      if (agent.skills && agent.skills.length > 0) {
        const allSkills = await fetchAllSkills(config.registries);

        for (const skillName of agent.skills) {
          if (await skillExists(skillName)) {
            continue; // Already installed
          }

          const skill = allSkills.find((s) => s.name === skillName);
          if (!skill) {
            console.error(
              `    Warning: Required skill '${skillName}' not found in registries`
            );
            continue;
          }

          console.log(`    Installing required skill: ${skillName}...`);

          // Install utils (from registry manifest)
          if (skill.utils) {
            for (const utilName of skill.utils) {
              const utilPath = `${utilName}.ts`;
              if (!(await utilExists(utilsPath, utilPath))) {
                try {
                  const content = await fetchUtilFile(skill.registry, utilPath, skill.basePath);
                  await installUtil(utilsPath, utilPath, content);
                } catch {
                  // Skip util errors
                }
              }
            }
          }

          // Add dependencies (from registry manifest)
          if (skill.dependencies) {
            const addedDeps = await updatePackageJson(skill.dependencies);
            allAddedDeps.push(...addedDeps);
          }

          // Fetch and install skill files using registry manifest
          const files = await fetchSkillFiles(skill.registry, skill, isLegacy);
          await installSkillFiles(skill.name, files);
          allAddedSkills.push(skill.name);
        }
      }

      // Fetch and install agent files using registry manifest
      const agentFiles = await fetchAgentFiles(agent.registry, agent);
      // Install agent.md as the main file
      const agentMd = agentFiles.find((f) => f.relativePath === "agent.md");
      if (agentMd) {
        await installAgentFile(agent.name, agentMd.content);
      }

      console.log(`  Installed ${agent.name}`);
      installed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to install ${agent.name}: ${message}`);
    }
  }

  // Print summary
  console.log(`\nDone! ${installed} installed, ${skipped} skipped.`);

  if (allAddedMcp.length > 0) {
    console.log(`\nAdded MCP servers to opencode.json: ${allAddedMcp.join(", ")}`);
  }

  if (allAddedSkills.length > 0) {
    console.log(`Installed required skills: ${allAddedSkills.join(", ")}`);
  }

  if (allAddedDeps.length > 0) {
    console.log(`Added dependencies: ${allAddedDeps.join(", ")}`);
    console.log("\nRun `bun install` to install dependencies.");
  }

  console.log();
}
