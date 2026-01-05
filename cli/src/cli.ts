#!/usr/bin/env bun

import { init } from "./commands/init.ts";
import { list } from "./commands/list.ts";
import { add } from "./commands/add.ts";
import { migrate } from "./commands/migrate.ts";

const VERSION = "0.0.6";

const HELP = `
skz - Skill manager for OpenCode and Claude

Usage: skz <command> [options]

Commands:
  init [--claude]         Initialize skillz in current directory
  list                    List available skills from registries
  add [skills...]         Add skills to your project
  migrate                 Migrate legacy config to .opencode/

Options:
  -h, --help              Show this help message
  -v, --version           Show version number

Init Command:
  skz init                Auto-detect OpenCode or Claude directories
  skz init --claude       Force Claude mode (creates .claude/skills/)

Examples:
  skz init                Initialize skillz in your project
  skz list                List all available skills
  skz add code-review     Add a specific skill
  skz add                 Interactive skill picker
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
    case "init": {
      const initArgs = args.slice(1);
      const isClaude = initArgs.includes("--claude");
      await init(isClaude);
      break;
    }

    case "list":
      await list();
      break;

    case "add": {
      const skillNames = args.slice(1);
      await add(skillNames);
      break;
    }

    case "migrate":
      await migrate();
      break;

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
