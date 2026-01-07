#!/usr/bin/env bun
/**
 * Check if a PR needs code review
 *
 * Determines if review should proceed by checking:
 * - PR is not closed
 * - PR is not a draft
 * - PR has not already been reviewed by Claude/AI
 * - PR is not trivial (automated, single-line changes)
 *
 * Usage:
 *   bun run check-review-needed.ts [pr-number]
 *
 * Options:
 *   --help    Show this help
 *
 * Output:
 *   JSON with shouldReview boolean and reason string
 */

import {
  checkGhCli,
  getPrJson,
  getPrComments,
  resolvePrNumber,
} from "../../utils/github.ts";
import { parseArgs, error } from "../../utils/utils.ts";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Check if a PR needs code review

Usage:
  bun run check-review-needed.ts [pr-number]

Arguments:
  pr-number    PR number (optional, defaults to current branch's PR)

Output:
  JSON object with:
    shouldReview: boolean - whether review should proceed
    reason: string - explanation for the decision

Examples:
  bun run check-review-needed.ts
  bun run check-review-needed.ts 123
`);
  process.exit(0);
}

interface PrInfo {
  number: number;
  state: string;
  isDraft: boolean;
  title: string;
  body: string;
  additions: number;
  deletions: number;
  author: { login: string };
}

interface ReviewResult {
  shouldReview: boolean;
  reason: string;
  prNumber: number;
}

// Patterns that indicate automated/trivial PRs
const TRIVIAL_TITLE_PATTERNS = [
  /^bump /i,
  /^update dependencies/i,
  /^chore\(deps\)/i,
  /^\[bot\]/i,
  /^automated/i,
  /^auto-generated/i,
];

// Known bot authors
const BOT_AUTHORS = [
  "dependabot",
  "dependabot[bot]",
  "renovate",
  "renovate[bot]",
  "github-actions",
  "github-actions[bot]",
];

// Patterns indicating Claude has already reviewed
const CLAUDE_REVIEW_PATTERNS = [
  /^## Code review/m,
  /No issues found\. Checked for bugs/i,
  /checked for bugs and (CLAUDE|AGENTS)\.md compliance/i,
];

function checkIfTrivial(pr: PrInfo): string | null {
  // Check for bot authors
  const authorLower = pr.author.login.toLowerCase();
  if (BOT_AUTHORS.some((bot) => authorLower.includes(bot))) {
    return `Automated PR from bot: ${pr.author.login}`;
  }

  // Check for trivial title patterns
  for (const pattern of TRIVIAL_TITLE_PATTERNS) {
    if (pattern.test(pr.title)) {
      return `Trivial/automated PR: "${pr.title}"`;
    }
  }

  // Check for very small changes (single line, likely typo fix)
  if (pr.additions + pr.deletions <= 2) {
    return `Trivial change: ${pr.additions} additions, ${pr.deletions} deletions`;
  }

  return null;
}

function checkIfAlreadyReviewed(
  comments: { author: { login: string }; body: string }[]
): string | null {
  for (const comment of comments) {
    // Check if any comment matches Claude review patterns
    for (const pattern of CLAUDE_REVIEW_PATTERNS) {
      if (pattern.test(comment.body)) {
        return `Already reviewed by ${comment.author.login}`;
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  checkGhCli();

  const prNumber = resolvePrNumber(positional[0]);

  // Get PR info
  const pr = getPrJson<PrInfo>(prNumber, [
    "number",
    "state",
    "isDraft",
    "title",
    "body",
    "additions",
    "deletions",
    "author",
  ]);

  const result: ReviewResult = {
    shouldReview: true,
    reason: "PR is ready for review",
    prNumber: pr.number,
  };

  // Check if PR is closed
  if (pr.state === "CLOSED" || pr.state === "MERGED") {
    result.shouldReview = false;
    result.reason = `PR is ${pr.state.toLowerCase()}`;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Check if PR is draft
  if (pr.isDraft) {
    result.shouldReview = false;
    result.reason = "PR is a draft";
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Check if trivial/automated
  const trivialReason = checkIfTrivial(pr);
  if (trivialReason) {
    result.shouldReview = false;
    result.reason = trivialReason;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Check if already reviewed by Claude
  const comments = getPrComments(prNumber);
  const alreadyReviewedReason = checkIfAlreadyReviewed(comments);
  if (alreadyReviewedReason) {
    result.shouldReview = false;
    result.reason = alreadyReviewedReason;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // All checks passed
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => error(e.message));
