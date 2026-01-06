#!/usr/bin/env bun
/**
 * Post an inline comment on a PR
 *
 * Posts a review comment on a specific line or line range in a PR file.
 * Supports suggestion blocks for small fixes.
 *
 * Usage:
 *   bun run post-inline-comment.ts <pr-number> --path <file> --line <n> --body <text>
 *
 * Options:
 *   --path <file>        File path to comment on (required)
 *   --line <n>           Line number to comment on (required)
 *   --start-line <n>     Start line for multi-line comments
 *   --body <text>        Comment body (required)
 *   --help               Show this help
 */

import {
  checkGhCli,
  getRepoInfo,
  getPrHeadSha,
  postInlineComment,
  resolvePrNumber,
} from "../../utils/github.ts";
import { parseArgs, error } from "../../utils/utils.ts";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Post an inline comment on a PR

Posts a review comment on a specific line or line range in a PR file.

Usage:
  bun run post-inline-comment.ts <pr-number> --path <file> --line <n> --body <text>

Arguments:
  pr-number            PR number (optional if on a PR branch)

Options:
  --path <file>        File path to comment on (required)
  --line <n>           Line number to comment on (required)
  --start-line <n>     Start line for multi-line comments (optional)
  --body <text>        Comment body, supports markdown (required)
  --help               Show this help

Suggestion Format:
  To include a code suggestion, use a suggestion block in the body:

  \`\`\`suggestion
  corrected code here
  \`\`\`

  The suggestion must be complete - clicking "Commit suggestion" should
  produce a working fix without additional changes.

Examples:
  # Single line comment
  bun run post-inline-comment.ts 123 --path src/auth.ts --line 67 \\
    --body "Missing error handling for OAuth callback"

  # Multi-line comment
  bun run post-inline-comment.ts 123 --path src/auth.ts --line 70 \\
    --start-line 65 --body "This entire block needs refactoring"

  # With suggestion
  bun run post-inline-comment.ts 123 --path src/auth.ts --line 67 \\
    --body $'Fix error handling:\\n\`\`\`suggestion\\ntry {\\n  await auth();\\n} catch (e) {\\n  handleError(e);\\n}\\n\`\`\`'
`);
  process.exit(0);
}

async function main(): Promise<void> {
  checkGhCli();

  // Parse arguments
  const prNumber = resolvePrNumber(positional[0]);

  const path = flags.path;
  const line = flags.line;
  const startLine = flags["start-line"];
  const body = flags.body;

  // Validate required arguments
  if (typeof path !== "string" || !path) {
    error("--path is required");
  }

  if (typeof line !== "string" || !line) {
    error("--line is required");
  }

  if (typeof body !== "string" || !body) {
    error("--body is required");
  }

  const lineNum = parseInt(line, 10);
  if (isNaN(lineNum) || lineNum < 1) {
    error("--line must be a positive integer");
  }

  let startLineNum: number | undefined;
  if (typeof startLine === "string" && startLine) {
    startLineNum = parseInt(startLine, 10);
    if (isNaN(startLineNum) || startLineNum < 1) {
      error("--start-line must be a positive integer");
    }
    if (startLineNum > lineNum) {
      error("--start-line must be less than or equal to --line");
    }
  }

  const { owner, repo } = getRepoInfo();
  const commitSha = getPrHeadSha(prNumber);

  // Post the comment
  postInlineComment({
    owner,
    repo,
    prNumber,
    commitSha,
    path,
    line: lineNum,
    startLine: startLineNum,
    body,
  });

  console.log(`Posted comment on ${path}:${startLineNum ? `${startLineNum}-` : ""}${lineNum}`);
}

main().catch((e) => error(e.message));
