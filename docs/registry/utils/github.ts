/**
 * GitHub utilities for CLI skills
 * Wraps `gh` CLI for common GitHub operations
 */

import { execSync, spawnSync } from "node:child_process";

/**
 * Execute a shell command and return stdout
 * Throws on non-zero exit code
 */
export function exec(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

/**
 * Execute a shell command, returning null on error instead of throwing
 */
export function execSafe(cmd: string): string | null {
  try {
    return exec(cmd);
  } catch {
    return null;
  }
}

/**
 * Execute gh CLI with arguments, properly escaping
 */
export function gh(args: string[]): string {
  const result = spawnSync("gh", args, { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `gh command failed: gh ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

/**
 * Execute gh CLI, returning null on error
 */
export function ghSafe(args: string[]): string | null {
  try {
    return gh(args);
  } catch {
    return null;
  }
}

/**
 * Get current repo info from git remote
 */
export function getRepoInfo(): { owner: string; repo: string } {
  const remote = exec("git remote get-url origin");
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) {
    throw new Error("Could not parse GitHub remote URL");
  }
  return { owner: match[1]!, repo: match[2]!.replace(/\.git$/, "") };
}

/**
 * Get current PR number from branch (if any)
 * Returns null if current branch has no associated PR
 */
export function getCurrentPrNumber(): string | null {
  const result = ghSafe(["pr", "view", "--json", "number", "-q", ".number"]);
  return result || null;
}

/**
 * Resolve PR number - uses provided number or detects from current branch
 */
export function resolvePrNumber(provided?: string): string {
  if (provided) {
    return provided;
  }
  const detected = getCurrentPrNumber();
  if (!detected) {
    throw new Error(
      "No PR number provided and current branch has no associated PR"
    );
  }
  return detected;
}

/**
 * Check if gh CLI is installed and authenticated
 */
export function checkGhCli(): void {
  try {
    exec("gh auth status 2>&1");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("not logged")) {
      throw new Error("GitHub CLI not authenticated. Run: gh auth login");
    }
    // Check if gh is not installed
    const whichResult = execSafe("which gh");
    if (!whichResult) {
      throw new Error(
        "GitHub CLI not installed. Install with: brew install gh"
      );
    }
    throw new Error(`GitHub CLI error: ${message}`);
  }
}

/**
 * Get the guideline file names to search for
 * Returns in priority order (first match wins per directory)
 * Note: AGENTS.md is used for OpenCode, CLAUDE.md for Claude Code
 * The CLI transforms this at install time for Claude Code targets
 */
export function getGuidelineFileNames(): string[] {
  // AGENTS.md takes priority if both exist in same directory
  return ["AGENTS.md", "CLAUDE.md"];
}

/**
 * Get PR details as JSON
 */
export function getPrJson<T>(
  prNumber: string,
  fields: string[]
): T {
  const json = gh([
    "pr",
    "view",
    prNumber,
    "--json",
    fields.join(","),
  ]);
  return JSON.parse(json) as T;
}

/**
 * Get the full commit SHA for a PR's head
 */
export function getPrHeadSha(prNumber: string): string {
  return gh([
    "pr",
    "view",
    prNumber,
    "--json",
    "headRefOid",
    "-q",
    ".headRefOid",
  ]);
}

/**
 * Get list of files changed in a PR
 */
export function getPrFiles(prNumber: string): string[] {
  const json = gh([
    "pr",
    "view",
    prNumber,
    "--json",
    "files",
    "-q",
    ".files[].path",
  ]);
  return json.split("\n").filter(Boolean);
}

/**
 * Get unique directory paths from a list of file paths
 * Includes all parent directories up to root
 */
export function getDirectoriesFromFiles(files: string[]): string[] {
  const dirs = new Set<string>();
  dirs.add(""); // Root directory

  for (const file of files) {
    const parts = file.split("/");
    // Build up directory paths
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }

  return [...dirs].sort();
}

/**
 * Check if a file exists in the repo at a given ref
 */
export function fileExistsInRepo(
  owner: string,
  repo: string,
  path: string,
  ref: string
): boolean {
  const result = ghSafe([
    "api",
    `repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    "--silent",
  ]);
  return result !== null;
}

/**
 * Get file content from repo at a given ref
 * Returns null if file doesn't exist
 */
export function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string
): string | null {
  try {
    const json = gh([
      "api",
      `repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    ]);
    const data = JSON.parse(json) as { content?: string; encoding?: string };
    if (data.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export interface PrComment {
  author: { login: string };
  body: string;
  createdAt: string;
}

/**
 * Get comments on a PR
 */
export function getPrComments(prNumber: string): PrComment[] {
  const json = gh([
    "pr",
    "view",
    prNumber,
    "--json",
    "comments",
    "-q",
    ".comments",
  ]);
  return JSON.parse(json) as PrComment[];
}

/**
 * Post a comment on a PR
 */
export function postPrComment(prNumber: string, body: string): void {
  gh(["pr", "comment", prNumber, "--body", body]);
}

export interface InlineCommentParams {
  owner: string;
  repo: string;
  prNumber: string;
  commitSha: string;
  path: string;
  line: number;
  startLine?: number;
  body: string;
}

/**
 * Post an inline comment on a PR
 * Uses the GitHub REST API via gh
 */
export function postInlineComment(params: InlineCommentParams): void {
  const { owner, repo, prNumber, commitSha, path, line, startLine, body } =
    params;

  const apiArgs = [
    "api",
    "--method",
    "POST",
    `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    "-f",
    `body=${body}`,
    "-f",
    `path=${path}`,
    "-f",
    `commit_id=${commitSha}`,
    "-F",
    `line=${line}`,
  ];

  // Add start_line for multi-line comments
  if (startLine !== undefined && startLine !== line) {
    apiArgs.push("-F", `start_line=${startLine}`);
    // GitHub requires side parameter for multi-line comments
    apiArgs.push("-f", "side=RIGHT");
    apiArgs.push("-f", "start_side=RIGHT");
  } else {
    apiArgs.push("-f", "side=RIGHT");
  }

  gh(apiArgs);
}
