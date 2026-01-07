#!/usr/bin/env bun
/**
 * Create a new tmux session
 *
 * Usage:
 *   bun run create-session.ts <name> [options]
 *
 * Options:
 *   --command <cmd>    Initial command to run
 *   --workdir <path>   Working directory
 *   --window <name>    Initial window name
 *   --json             Output as JSON
 *   --help             Show this help
 */

import {
  checkTmuxInstalled,
  sessionExists,
  createSession,
  getSessionInfo,
} from "../../utils/tmux";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Create a new tmux session

Usage:
  bun run create-session.ts <name> [options]

Arguments:
  name    Session name (required)

Options:
  --command <cmd>    Initial command to run in the session
  --workdir <path>   Working directory for the session
  --window <name>    Name for the initial window
  --json             Output as JSON
  --help             Show this help

Examples:
  bun run create-session.ts db-session --command "psql -h localhost -U postgres"
  bun run create-session.ts logs --command "tail -f /var/log/app.log"
  bun run create-session.ts dev --workdir ~/projects/myapp
`);
  process.exit(0);
}

const sessionName = positional[0];
if (!sessionName) {
  error("Session name is required. Usage: create-session.ts <name> [options]");
}

const jsonOutput = flags.json === true;

async function main() {
  await checkTmuxInstalled();

  // Check if session already exists
  if (await sessionExists(sessionName)) {
    error(`Session '${sessionName}' already exists`);
  }

  // Create the session
  await createSession(sessionName, {
    command: typeof flags.command === "string" ? flags.command : undefined,
    workdir: typeof flags.workdir === "string" ? flags.workdir : undefined,
    windowName: typeof flags.window === "string" ? flags.window : undefined,
  });

  // Get session info for output
  const info = await getSessionInfo(sessionName);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          success: true,
          session: sessionName,
          info,
        },
        null,
        2
      )
    );
  } else {
    console.log(`Created session: ${sessionName}`);
    if (typeof flags.command === "string") {
      console.log(`Running: ${flags.command}`);
    }
    if (typeof flags.workdir === "string") {
      console.log(`Working directory: ${flags.workdir}`);
    }
    console.log(`\nAttach with: tmux attach -t ${sessionName}`);
  }
}

main().catch((e) => error(e.message));
