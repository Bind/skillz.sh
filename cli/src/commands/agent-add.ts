import { checkbox, confirm } from "@inquirer/prompts";
import { readConfig, createDefaultConfig, writeConfig } from "../lib/config.ts";
import {
  fetchAllAgents,
  fetchAgentFile,
  fetchAgentJson,
  fetchAllSkills,
  fetchSkillFiles,
  fetchSkillJson,
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
import { SKILLS_DIR } from "../types.ts";
import { mkdir } from "node:fs/promises";

export async function agentAdd(agentNames: string[]): Promise<void> {
  let config = await readConfig();

  if (!config) {
    config = createDefaultConfig();
    await writeConfig(config);
    await mkdir(SKILLS_DIR, { recursive: true });
    await mkdir(config.utils, { recursive: true });
  }

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

      // Fetch agent.json for MCP and skill dependencies
      const agentJson = await fetchAgentJson(agent.registry, agent.name);

      // Install MCP servers
      if (agentJson?.mcp) {
        const addedMcp = await addMcpServers(agentJson.mcp);
        allAddedMcp.push(...addedMcp);
      }

      // Install required skills
      if (agentJson?.skills) {
        const allSkills = await fetchAllSkills(config.registries);

        for (const skillName of agentJson.skills) {
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

          // Install the skill (simplified version of add.ts logic)
          const skillJson = await fetchSkillJson(skill.registry, skill.name);

          if (skillJson?.utils) {
            for (const utilName of skillJson.utils) {
              const utilPath = `${utilName}.ts`;
              if (!(await utilExists(config.utils, utilPath))) {
                try {
                  const content = await fetchUtilFile(skill.registry, utilPath);
                  await installUtil(config.utils, utilPath, content);
                } catch {
                  // Skip util errors
                }
              }
            }
          }

          if (skillJson?.dependencies) {
            const addedDeps = await updatePackageJson(skillJson.dependencies);
            allAddedDeps.push(...addedDeps);
          }

          const files = await fetchSkillFiles(skill.registry, skill.name);
          await installSkillFiles(skill.name, files);
          allAddedSkills.push(skill.name);
        }
      }

      // Fetch and install agent file
      const agentContent = await fetchAgentFile(agent.registry, agent.name);
      await installAgentFile(agent.name, agentContent);

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
