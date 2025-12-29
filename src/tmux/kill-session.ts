#!/usr/bin/env bun
/**
 * Kill a tmux session
 *
 * Usage:
 *   bun run kill-session.ts <name> [options]
 *
 * Options:
 *   --json    Output as JSON
 *   --help    Show this help
 */

import { checkTmuxInstalled, sessionExists, killSession } from "../../utils/tmux";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Kill a tmux session

Usage:
  bun run kill-session.ts <name> [options]

Arguments:
  name    Session name to kill

Options:
  --json    Output as JSON
  --help    Show this help

Examples:
  bun run kill-session.ts db-session
  bun run kill-session.ts logs
`);
  process.exit(0);
}

const sessionName = positional[0];
if (!sessionName) {
  error("Session name is required. Usage: kill-session.ts <name>");
}

const jsonOutput = flags.json === true;

async function main() {
  await checkTmuxInstalled();

  if (!(await sessionExists(sessionName))) {
    error(`Session '${sessionName}' does not exist`);
  }

  await killSession(sessionName);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          success: true,
          session: sessionName,
          message: `Session '${sessionName}' killed`,
        },
        null,
        2
      )
    );
  } else {
    console.log(`Killed session: ${sessionName}`);
  }
}

main().catch((e) => error(e.message));
