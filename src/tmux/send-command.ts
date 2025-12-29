#!/usr/bin/env bun
/**
 * Send a command to a tmux session
 *
 * Usage:
 *   bun run send-command.ts <session> <command> [options]
 *
 * Options:
 *   --no-enter    Send keys without pressing Enter
 *   --literal     Send keys literally (no special key interpretation)
 *   --json        Output as JSON
 *   --help        Show this help
 */

import {
  checkTmuxInstalled,
  sessionExists,
  sendCommand,
  sendKeys,
} from "../../utils/tmux";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Send a command to a tmux session

Usage:
  bun run send-command.ts <session> <command> [options]

Arguments:
  session    Session name (or session:window or session:window.pane)
  command    Command or keys to send

Options:
  --no-enter    Send keys without pressing Enter
  --literal     Send keys literally (no special key interpretation)
  --json        Output as JSON
  --help        Show this help

Special Keys (when not using --literal):
  C-c    Ctrl+C (interrupt)
  C-d    Ctrl+D (EOF)
  C-l    Ctrl+L (clear)
  C-m    Enter
  C-z    Ctrl+Z (suspend)

Examples:
  bun run send-command.ts db-session "SELECT * FROM users;"
  bun run send-command.ts logs "C-c" --no-enter
  bun run send-command.ts dev "echo hello" --no-enter
`);
  process.exit(0);
}

const target = positional[0];
const command = positional[1];

if (!target) {
  error("Session name is required. Usage: send-command.ts <session> <command>");
}
if (!command) {
  error("Command is required. Usage: send-command.ts <session> <command>");
}

const jsonOutput = flags.json === true;
const noEnter = flags["no-enter"] === true;
const literal = flags.literal === true;

async function main() {
  await checkTmuxInstalled();

  // Extract session name from target (could be session:window.pane)
  const sessionName = target.split(":")[0];
  if (!(await sessionExists(sessionName))) {
    error(`Session '${sessionName}' does not exist`);
  }

  // Send the command
  if (noEnter) {
    await sendKeys(target, command, literal);
  } else {
    if (literal) {
      // Send literal keys then Enter
      await sendKeys(target, command, true);
      await sendKeys(target, "C-m", false);
    } else {
      await sendCommand(target, command);
    }
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          success: true,
          target,
          command,
          options: { noEnter, literal },
        },
        null,
        2
      )
    );
  } else {
    console.log(`Sent to ${target}: ${command}${noEnter ? "" : " [Enter]"}`);
  }
}

main().catch((e) => error(e.message));
