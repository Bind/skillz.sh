/**
 * tmux utilities for managing terminal sessions
 * These utilities are copied to user projects and can be customized
 */

import { $ } from "bun";

/**
 * Check if tmux is installed
 */
export async function checkTmuxInstalled(): Promise<void> {
  try {
    await $`which tmux`.quiet();
  } catch {
    console.error("Error: tmux is not installed");
    console.error("Install it with: brew install tmux (macOS) or apt install tmux (Linux)");
    process.exit(1);
  }
}

/**
 * Check if a tmux session exists
 */
export async function sessionExists(name: string): Promise<boolean> {
  try {
    await $`tmux has-session -t ${name}`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * List all tmux sessions
 */
export async function listSessions(): Promise<
  Array<{
    name: string;
    windows: number;
    created: string;
    attached: boolean;
  }>
> {
  try {
    const result =
      await $`tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_created}|#{?session_attached,attached,detached}"`.text();
    return result
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, windows, created, attached] = line.split("|");
        return {
          name: name ?? "",
          windows: parseInt(windows ?? "0", 10),
          created: new Date(parseInt(created ?? "0", 10) * 1000).toISOString(),
          attached: attached === "attached",
        };
      });
  } catch {
    // No sessions or tmux server not running
    return [];
  }
}

/**
 * Create a new tmux session
 */
export async function createSession(
  name: string,
  options?: {
    command?: string;
    workdir?: string;
    windowName?: string;
  }
): Promise<void> {
  const args = ["new-session", "-d", "-s", name];

  if (options?.windowName) {
    args.push("-n", options.windowName);
  }

  if (options?.workdir) {
    args.push("-c", options.workdir);
  }

  if (options?.command) {
    args.push(options.command);
  }

  await $`tmux ${args}`.quiet();
}

/**
 * Kill a tmux session
 */
export async function killSession(name: string): Promise<void> {
  await $`tmux kill-session -t ${name}`.quiet();
}

/**
 * Send keys to a tmux session
 * @param target - Session name, or session:window, or session:window.pane
 * @param keys - Keys to send (use C-m for Enter, C-c for Ctrl+C, etc.)
 * @param literal - If true, send keys literally without interpreting special sequences
 */
export async function sendKeys(
  target: string,
  keys: string,
  literal = false
): Promise<void> {
  const args = literal
    ? ["tmux", "send-keys", "-l", "-t", target, keys]
    : ["tmux", "send-keys", "-t", target, keys];
  
  const proc = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || `tmux send-keys failed`);
  }
}

/**
 * Send a command to a tmux session (sends keys + Enter)
 * Uses load-buffer + paste-buffer for reliability across tmux configs
 */
export async function sendCommand(target: string, command: string): Promise<void> {
  // Load command into a buffer and paste it, then send Enter
  // This approach is more reliable across different tmux configurations
  const bufferName = `cmd-${Date.now()}`;
  
  // Load command + newline into buffer
  const loadProc = Bun.spawn(["tmux", "load-buffer", "-b", bufferName, "-"], {
    stdin: new Blob([command + "\n"]),
    stdout: "ignore",
    stderr: "pipe",
  });
  let exitCode = await loadProc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(loadProc.stderr).text();
    throw new Error(stderr.trim() || `tmux load-buffer failed`);
  }

  // Paste buffer to target
  const pasteProc = Bun.spawn(["tmux", "paste-buffer", "-b", bufferName, "-t", target], {
    stdout: "ignore", 
    stderr: "pipe",
  });
  exitCode = await pasteProc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(pasteProc.stderr).text();
    throw new Error(stderr.trim() || `tmux paste-buffer failed`);
  }

  // Clean up buffer
  await Bun.spawn(["tmux", "delete-buffer", "-b", bufferName]).exited;
}

/**
 * Send Ctrl+C to a tmux session (interrupt)
 */
export async function sendInterrupt(target: string): Promise<void> {
  const proc = Bun.spawn(["tmux", "send-keys", "-t", target, "C-c"], {
    stdout: "ignore",
    stderr: "pipe",
  });
  await proc.exited;
}

/**
 * Capture pane content from a tmux session
 * @param target - Session name, or session:window, or session:window.pane
 * @param options - Capture options
 */
export async function capturePane(
  target: string,
  options?: {
    startLine?: number; // Negative for scrollback history
    endLine?: number;
  }
): Promise<string> {
  const args = ["capture-pane", "-p", "-t", target];

  if (options?.startLine !== undefined) {
    args.push("-S", String(options.startLine));
  }

  if (options?.endLine !== undefined) {
    args.push("-E", String(options.endLine));
  }

  const result = await $`tmux ${args}`.text();
  return result;
}

/**
 * Wait for specific output pattern in a tmux session
 * @param target - Session name
 * @param pattern - Regex pattern to match
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @param pollIntervalMs - Poll interval in milliseconds (default: 500)
 * @returns The captured output when pattern is found, or null on timeout
 */
export async function waitForOutput(
  target: string,
  pattern: RegExp | string,
  timeoutMs = 30000,
  pollIntervalMs = 500
): Promise<string | null> {
  const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const output = await capturePane(target, { startLine: -1000 });
    if (regex.test(output)) {
      return output;
    }
    await Bun.sleep(pollIntervalMs);
  }

  return null;
}

/**
 * Get session info
 */
export async function getSessionInfo(name: string): Promise<{
  name: string;
  windows: number;
  created: string;
  attached: boolean;
  currentWindow: string;
  currentPane: string;
} | null> {
  try {
    const result =
      await $`tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_created}|#{?session_attached,attached,detached}|#{window_name}|#{pane_index}" -f "#{==:#{session_name},${name}}"`.text();
    const line = result.trim().split("\n")[0];
    if (!line) return null;

    const [sessionName, windows, created, attached, windowName, paneIndex] =
      line.split("|");
    return {
      name: sessionName ?? "",
      windows: parseInt(windows ?? "0", 10),
      created: new Date(parseInt(created ?? "0", 10) * 1000).toISOString(),
      attached: attached === "attached",
      currentWindow: windowName ?? "",
      currentPane: paneIndex ?? "0",
    };
  } catch {
    return null;
  }
}
