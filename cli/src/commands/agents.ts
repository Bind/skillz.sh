import { select, checkbox, confirm } from "@inquirer/prompts";
import {
  getAgents,
  getAgent,
  getInstalledSkills,
  updateAgentSkillPermissions,
  getAgentSkillPermissions,
  isSkillEnabledForAgent,
  type Agent,
  type InstalledSkill,
  type AgentLocation,
} from "../lib/agent.ts";
import { agentAdd } from "./agent-add.ts";
import { readConfig } from "../lib/config.ts";
import { fetchAllAgents } from "../lib/registry.ts";

type PermissionValue = "allow" | "deny" | "ask";

interface AgentsOptions {
  global: boolean;
}

function formatPermission(perm: PermissionValue | undefined): string {
  switch (perm) {
    case "allow":
      return "\x1b[32mallow\x1b[0m";
    case "deny":
      return "\x1b[31mdeny\x1b[0m";
    case "ask":
      return "\x1b[33mask\x1b[0m";
    default:
      return "\x1b[90m(default: allow)\x1b[0m";
  }
}

function printAgentSkillStatus(agent: Agent, skills: InstalledSkill[]): void {
  const permissions = getAgentSkillPermissions(agent);

  console.log(`\n\x1b[1mAgent: ${agent.name}\x1b[0m`);
  console.log(`  Location: ${agent.location}`);
  console.log(`  Mode: ${agent.frontmatter.mode ?? "all"}`);
  if (agent.frontmatter.description) {
    console.log(`  Description: ${agent.frontmatter.description}`);
  }

  console.log("\n  Skill Permissions:");

  // Show wildcard patterns first
  const wildcardPatterns = Object.entries(permissions).filter(([k]) =>
    k.includes("*")
  );
  if (wildcardPatterns.length > 0) {
    for (const [pattern, perm] of wildcardPatterns) {
      console.log(`    ${pattern}: ${formatPermission(perm)}`);
    }
    console.log();
  }

  // Show individual skills
  if (skills.length === 0) {
    console.log("    (no skills installed)");
  } else {
    for (const skill of skills) {
      const perm = permissions[skill.name];
      const enabled = isSkillEnabledForAgent(agent, skill.name);
      const status = enabled ? "" : " [DISABLED]";
      console.log(`    ${skill.name}: ${formatPermission(perm)}${status}`);
    }
  }

  console.log();
}

async function selectAgent(agents: Agent[], location: AgentLocation): Promise<Agent | null> {
  if (agents.length === 0) {
    console.log("\nNo agents found.");
    if (location === "project") {
      console.log("Create an agent in .opencode/agent/");
      console.log("Or use --global to manage global agents.");
    } else {
      console.log("Create an agent in ~/.config/opencode/agent/");
    }
    return null;
  }

  const choices = agents.map((agent) => ({
    name: `${agent.name} - ${agent.frontmatter.description ?? "No description"}`,
    value: agent,
  }));

  return select({
    message: "Select an agent to manage:",
    choices,
  });
}

async function manageSkillPermissions(
  agent: Agent,
  skills: InstalledSkill[]
): Promise<void> {
  if (skills.length === 0) {
    console.log("\nNo skills installed. Run 'skz add' to install skills first.");
    return;
  }

  const currentPermissions = getAgentSkillPermissions(agent);

  const choices = skills.map((skill) => {
    const currentPerm = currentPermissions[skill.name];
    const status = formatPermission(currentPerm);
    return {
      name: `${skill.name} [${status}] - ${skill.description ?? ""}`,
      value: skill.name,
    };
  });

  const selectedSkills = await checkbox({
    message: "Select skills to configure:",
    choices,
  });

  if (selectedSkills.length === 0) {
    console.log("No skills selected.");
    return;
  }

  const newPermission = await select<PermissionValue>({
    message: "Set permission for selected skills:",
    choices: [
      { name: "allow - Skill loads immediately", value: "allow" },
      { name: "ask - User prompted before loading", value: "ask" },
      { name: "deny - Skill hidden and access rejected", value: "deny" },
    ],
  });

  const updates: Record<string, PermissionValue> = {};
  for (const skillName of selectedSkills) {
    updates[skillName] = newPermission;
  }

  await updateAgentSkillPermissions(agent.name, updates);

  console.log(`\nUpdated permissions for ${selectedSkills.length} skill(s).`);
}

async function addWildcardPattern(agent: Agent): Promise<void> {
  const { input } = await import("@inquirer/prompts");

  const pattern = await input({
    message: "Enter wildcard pattern (e.g., 'internal-*', '*-read'):",
    validate: (value) => {
      if (!value.trim()) return "Pattern cannot be empty";
      if (!value.includes("*")) return "Pattern must contain a wildcard (*)";
      return true;
    },
  });

  const permission = await select<PermissionValue>({
    message: `Set permission for pattern '${pattern}':`,
    choices: [
      { name: "allow - Skills matching pattern load immediately", value: "allow" },
      { name: "ask - User prompted before loading", value: "ask" },
      { name: "deny - Skills matching pattern are hidden", value: "deny" },
    ],
  });

  await updateAgentSkillPermissions(agent.name, { [pattern]: permission });

  console.log(`\nAdded pattern '${pattern}' with permission '${permission}'.`);
}

async function interactiveManage(location: AgentLocation): Promise<void> {
  const agentList = await getAgents(location);
  const skills = await getInstalledSkills();

  const agent = await selectAgent(agentList, location);
  if (!agent) return;

  printAgentSkillStatus(agent, skills);

  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "Configure skill permissions", value: "configure" },
      { name: "Add wildcard pattern", value: "wildcard" },
      { name: "View current status", value: "view" },
      { name: "Exit", value: "exit" },
    ],
  });

  switch (action) {
    case "configure":
      await manageSkillPermissions(agent, skills);
      break;
    case "wildcard":
      await addWildcardPattern(agent);
      break;
    case "view":
      // Already shown above
      break;
    case "exit":
      return;
  }

  // Ask to continue
  const continueManaging = await confirm({
    message: "Continue managing this agent?",
    default: true,
  });

  if (continueManaging) {
    // Reload agent to get updated permissions
    const updatedAgent = await getAgent(agent.name, location);
    if (updatedAgent) {
      printAgentSkillStatus(updatedAgent, skills);
      await interactiveManage(location);
    }
  }
}

function parseAgentsArgs(args: string[]): { options: AgentsOptions; subArgs: string[] } {
  const options: AgentsOptions = { global: false };
  const subArgs: string[] = [];

  for (const arg of args) {
    if (arg === "--global" || arg === "-g") {
      options.global = true;
    } else {
      subArgs.push(arg);
    }
  }

  return { options, subArgs };
}

export async function agents(args: string[]): Promise<void> {
  const { options, subArgs } = parseAgentsArgs(args);
  const location: AgentLocation = options.global ? "global" : "project";
  const locationLabel = options.global ? "global" : "project";

  const agentList = await getAgents(location);
  const skills = await getInstalledSkills();

  // No subcommand - show help
  if (subArgs.length === 0) {
    console.log(`
Usage: skz agents <subcommand> [options]

Subcommands:
  list                                List agents available from registries
  add [agents...]                     Add prebuilt agents from registries
  installed [--global]                List installed agents
  show <agent> [--global]             Show agent's skill permissions
  set <agent> <skill> <perm>          Set permission (allow|deny|ask)
  enable <agent> <skill>              Enable skill (set to allow)
  disable <agent> <skill>             Disable skill (set to deny)

Options:
  --global, -g                        Use global agents (~/.config/opencode/agent/)

For interactive management, use: skz interactive
`);
    return;
  }

  const subcommand = subArgs[0];

  switch (subcommand) {
    case "add": {
      const agentNames = subArgs.slice(1);
      await agentAdd(agentNames);
      break;
    }

    case "list": {
      // List agents available from registries
      const config = await readConfig();

      if (!config) {
        console.error("No skz.json found. Run `skz init` first.");
        process.exit(1);
      }

      console.log("\nFetching agents from registries...\n");

      const registryAgents = await fetchAllAgents(config.registries);

      if (registryAgents.length === 0) {
        console.log("No agents found in configured registries.");
        return;
      }

      // Calculate column widths
      const nameWidth = Math.max(...registryAgents.map((a) => a.name.length), 4);
      const versionWidth = Math.max(...registryAgents.map((a) => a.version.length), 7);

      // Print header
      const header = `${"NAME".padEnd(nameWidth)}  ${"VERSION".padEnd(versionWidth)}  DESCRIPTION`;
      console.log(header);
      console.log("-".repeat(header.length));

      // Print agents
      for (const agent of registryAgents) {
        console.log(
          `${agent.name.padEnd(nameWidth)}  ${agent.version.padEnd(versionWidth)}  ${agent.description}`
        );
      }

      console.log(`\n${registryAgents.length} agent(s) available`);
      console.log("\nUse `skz agents add <name>` to install an agent.\n");
      break;
    }

    case "installed": {
      // List installed agents and their skill permissions
      if (agentList.length === 0) {
        console.log(`\nNo ${locationLabel} agents found.`);
        if (location === "project") {
          console.log("Create an agent in .opencode/agent/ or use `skz agents add`");
          console.log("Or use --global to list global agents.");
        } else {
          console.log("Create an agent in ~/.config/opencode/agent/");
        }
        return;
      }

      console.log(`\n${agentList.length} ${locationLabel} agent(s) installed:\n`);

      for (const agent of agentList) {
        printAgentSkillStatus(agent, skills);
      }
      break;
    }

    case "show": {
      // Show specific agent
      const agentName = subArgs[1];
      if (!agentName) {
        console.error("Usage: skz agents [--global] show <agent-name>");
        process.exit(1);
      }

      const agent = await getAgent(agentName, location);
      if (!agent) {
        console.error(`Agent '${agentName}' not found in ${locationLabel} agents.`);
        process.exit(1);
      }

      printAgentSkillStatus(agent, skills);
      break;
    }

    case "set": {
      // Set skill permission
      const [, agentName, skillName, permission] = subArgs;

      if (!agentName || !skillName || !permission) {
        console.error("Usage: skz agents [--global] set <agent-name> <skill-name> <allow|deny|ask>");
        process.exit(1);
      }

      if (!["allow", "deny", "ask"].includes(permission)) {
        console.error("Permission must be 'allow', 'deny', or 'ask'");
        process.exit(1);
      }

      const agent = await getAgent(agentName, location);
      if (!agent) {
        console.error(`Agent '${agentName}' not found in ${locationLabel} agents.`);
        process.exit(1);
      }

      await updateAgentSkillPermissions(agentName, {
        [skillName]: permission as PermissionValue,
      });

      console.log(`Set '${skillName}' to '${permission}' for agent '${agentName}'.`);
      break;
    }

    case "enable": {
      // Enable skill for agent
      const [, agentName, skillName] = subArgs;

      if (!agentName || !skillName) {
        console.error("Usage: skz agents [--global] enable <agent-name> <skill-name>");
        process.exit(1);
      }

      const agent = await getAgent(agentName, location);
      if (!agent) {
        console.error(`Agent '${agentName}' not found in ${locationLabel} agents.`);
        process.exit(1);
      }

      await updateAgentSkillPermissions(agentName, { [skillName]: "allow" });
      console.log(`Enabled '${skillName}' for agent '${agentName}'.`);
      break;
    }

    case "disable": {
      // Disable skill for agent
      const [, agentName, skillName] = subArgs;

      if (!agentName || !skillName) {
        console.error("Usage: skz agents [--global] disable <agent-name> <skill-name>");
        process.exit(1);
      }

      const agent = await getAgent(agentName, location);
      if (!agent) {
        console.error(`Agent '${agentName}' not found in ${locationLabel} agents.`);
        process.exit(1);
      }

      await updateAgentSkillPermissions(agentName, { [skillName]: "deny" });
      console.log(`Disabled '${skillName}' for agent '${agentName}'.`);
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.log(`
Usage: skz agents <subcommand> [options]

Subcommands:
  list                                List agents available from registries
  add [agents...]                     Add prebuilt agents from registries
  installed [--global]                List installed agents
  show <agent> [--global]             Show skill permissions for an agent
  set <agent> <skill> <permission>    Set skill permission (allow|deny|ask)
  enable <agent> <skill>              Enable skill for agent (set to allow)
  disable <agent> <skill>             Disable skill for agent (set to deny)

Options:
  --global, -g                        Use global agents (~/.config/opencode/agent/)

Examples:
  skz agents list                     List available agents from registries
  skz agents add docs                 Add the docs agent
  skz agents installed                List project agents
  skz agents installed --global       List global agents
  skz agents set builder linear-* deny    Deny linear skills for builder

For interactive management, use: skz interactive
`);
      process.exit(1);
  }
}
