#!/usr/bin/env bun

import { init } from "./commands/init.ts";
import { list } from "./commands/list.ts";
import { add } from "./commands/add.ts";

const VERSION = "0.0.4";

const HELP = `
skz - OpenCode skill manager

Usage: skz <command> [options]

Commands:
  init              Initialize skz.json in current directory
  list              List available skills from registries
  add [skills...]   Add skills to your project

Options:
  -h, --help        Show this help message
  -v, --version     Show version number

Examples:
  skz init                 Initialize skillz in your project
  skz list                 List all available skills
  skz add code-review      Add a specific skill
  skz add                  Interactive skill picker

Authentication:
  Uses GitHub CLI (gh) - run 'gh auth login' first
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
