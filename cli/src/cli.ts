#!/usr/bin/env bun

import { init } from "./commands/init.ts";
import { list } from "./commands/list.ts";
import { add } from "./commands/add.ts";
import { agents } from "./commands/agents.ts";
import { runAgentsTui } from "./tui/agents.ts";

const VERSION = "0.0.5";

const HELP = `
skz - OpenCode skill manager

Usage: skz <command> [options]

Commands:
  init                Initialize skz.json in current directory
  list                List available skills from registries
  add [skills...]     Add skills to your project
  agents [subcmd]     Manage agent skill permissions

Options:
  -h, --help          Show this help message
  -v, --version       Show version number

Agents Command:
  skz agents [--global] [subcommand]

  By default, manages project agents (.opencode/agent/).
  Use --global or -g to manage global agents (~/.config/opencode/agent/).

  Subcommands:
    (none)                            Interactive TUI mode
    list                              List agents and skill permissions
    show <agent>                      Show agent's skill permissions
    set <agent> <skill> <perm>        Set permission (allow|deny|ask)
    enable <agent> <skill>            Enable skill (set to allow)
    disable <agent> <skill>           Disable skill (set to deny)

Examples:
  skz init                            Initialize skillz in your project
  skz list                            List all available skills
  skz add code-review                 Add a specific skill
  skz add                             Interactive skill picker
  skz agents                          Manage project agents (TUI)
  skz agents --global                 Manage global agents (TUI)
  skz agents list                     List project agents
  skz agents -g list                  List global agents
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "-h" || command === "--help") {
    console.log(HELP);
    return;
  }

  if (command === "-v" || command === "--version") {
    console.log(`skz v${VERSION}`);
    return;
  }

  switch (command) {
    case "init":
      await init();
      break;

    case "list":
      await list();
      break;

    case "add":
      const skillNames = args.slice(1);
      await add(skillNames);
      break;

    case "agents": {
      const agentArgs = args.slice(1);
      const isGlobal = agentArgs.includes("--global") || agentArgs.includes("-g");
      const filteredArgs = agentArgs.filter((a) => a !== "--global" && a !== "-g");
      
      // No subcommand args launches TUI mode
      if (filteredArgs.length === 0) {
        await runAgentsTui(isGlobal);
      } else {
        await agents(agentArgs);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
