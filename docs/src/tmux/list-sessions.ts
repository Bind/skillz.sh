#!/usr/bin/env bun
/**
 * List all tmux sessions
 *
 * Usage:
 *   bun run list-sessions.ts [options]
 *
 * Options:
 *   --json    Output as JSON
 *   --help    Show this help
 */

import { checkTmuxInstalled, listSessions } from "../../utils/tmux";
import { parseArgs, formatTable, error } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
List all tmux sessions

Usage:
  bun run list-sessions.ts [options]

Options:
  --json    Output as JSON
  --help    Show this help

Examples:
  bun run list-sessions.ts
  bun run list-sessions.ts --json
`);
  process.exit(0);
}

const jsonOutput = flags.json === true;

async function main() {
  await checkTmuxInstalled();

  const sessions = await listSessions();

  if (sessions.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log("No tmux sessions found.");
    }
    return;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(sessions, null, 2));
  } else {
    const rows = sessions.map((s) => ({
      name: s.name,
      windows: s.windows,
      status: s.attached ? "attached" : "detached",
      created: s.created.replace("T", " ").slice(0, 19),
    }));

    console.log(
      formatTable(rows, [
        { key: "name", header: "Session", width: 25 },
        { key: "windows", header: "Windows", width: 8 },
        { key: "status", header: "Status", width: 10 },
        { key: "created", header: "Created", width: 20 },
      ])
    );
    console.log(`\n${sessions.length} session(s)`);
  }
}

main().catch((e) => error(e.message));
