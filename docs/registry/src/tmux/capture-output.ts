#!/usr/bin/env bun
/**
 * Capture output from a tmux session pane
 *
 * Usage:
 *   bun run capture-output.ts <session> [options]
 *
 * Options:
 *   --lines <n>        Lines of scrollback to capture (default: 100)
 *   --wait <pattern>   Wait for output matching this pattern
 *   --timeout <ms>     Timeout for --wait in ms (default: 30000)
 *   --json             Output as JSON
 *   --help             Show this help
 */

import {
  checkTmuxInstalled,
  sessionExists,
  capturePane,
  waitForOutput,
} from "../../utils/tmux";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Capture output from a tmux session pane

Usage:
  bun run capture-output.ts <session> [options]

Arguments:
  session    Session name (or session:window or session:window.pane)

Options:
  --lines <n>        Number of lines of scrollback to capture (default: 100)
  --wait <pattern>   Wait for output matching this regex pattern before capturing
  --timeout <ms>     Timeout for --wait in milliseconds (default: 30000)
  --json             Output as JSON
  --help             Show this help

Examples:
  bun run capture-output.ts db-session
  bun run capture-output.ts logs --lines 500
  bun run capture-output.ts db-session --wait "postgres=#" --timeout 5000
`);
  process.exit(0);
}

const target = positional[0];
if (!target) {
  error("Session name is required. Usage: capture-output.ts <session>");
}

const jsonOutput = flags.json === true;
const lines =
  typeof flags.lines === "string" ? parseInt(flags.lines, 10) : 100;
const waitPattern = typeof flags.wait === "string" ? flags.wait : undefined;
const timeout =
  typeof flags.timeout === "string" ? parseInt(flags.timeout, 10) : 30000;

async function main() {
  await checkTmuxInstalled();

  // Extract session name from target (could be session:window.pane)
  const sessionName = target.split(":")[0];
  if (!(await sessionExists(sessionName))) {
    error(`Session '${sessionName}' does not exist`);
  }

  let output: string;

  if (waitPattern) {
    // Wait for pattern then capture
    const result = await waitForOutput(target, waitPattern, timeout);
    if (result === null) {
      error(`Timeout waiting for pattern: ${waitPattern}`);
    }
    output = result;
  } else {
    // Capture immediately
    output = await capturePane(target, { startLine: -lines });
  }

  // Trim trailing whitespace/empty lines
  output = output.trimEnd();

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          target,
          lines: output.split("\n").length,
          output,
        },
        null,
        2
      )
    );
  } else {
    console.log(output);
  }
}

main().catch((e) => error(e.message));
