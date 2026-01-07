#!/usr/bin/env bun
/**
 * Get details for a single Linear issue
 *
 * Usage:
 *   bun run get-issue.ts <issue-id>
 *   bun run get-issue.ts ENG-123
 *   bun run get-issue.ts <uuid>
 *
 * Options:
 *   --json    Output as JSON
 *   --help    Show this help
 */

import { linear } from "../../utils/linear";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Get details for a single Linear issue

Usage:
  bun run get-issue.ts <issue-id>

Arguments:
  issue-id    Issue identifier (e.g., ENG-123) or UUID

Options:
  --json      Output as JSON

Examples:
  bun run get-issue.ts ENG-123
  bun run get-issue.ts ENG-123 --json
`);
  process.exit(0);
}

const issueId = positional[0];
if (!issueId) {
  error("Issue ID is required. Usage: bun run get-issue.ts <issue-id>");
}

const jsonOutput = flags.json === true;

async function main() {
  // Try to fetch by identifier first (e.g., ENG-123)
  let issue;

  if (issueId.match(/^[0-9a-f-]{36}$/i)) {
    // It's a UUID
    issue = await linear.issue(issueId);
  } else {
    // It's an identifier like ENG-123, use search
    const issues = await linear.issues({
      filter: { id: { eq: issueId } },
    });
    if (issues.nodes.length > 0) {
      issue = issues.nodes[0];
    } else {
      // Try searching by identifier
      const searchResult = await linear.searchIssues(issueId, { first: 1 });
      if (searchResult.nodes.length > 0) {
        issue = searchResult.nodes[0];
      }
    }
  }

  if (!issue) {
    error(`Issue not found: ${issueId}`);
  }

  const state = await issue.state;
  const assignee = await issue.assignee;
  const team = await issue.team;
  const project = await issue.project;
  const labels = await issue.labels();
  const comments = await issue.comments();

  const data = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    status: state?.name ?? "Unknown",
    priority: issue.priority ?? 0,
    priorityLabel: issue.priorityLabel ?? "None",
    assignee: assignee?.name ?? null,
    team: team?.name ?? null,
    project: project?.name ?? null,
    labels: labels.nodes.map((l) => l.name),
    commentCount: comments.nodes.length,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    url: issue.url,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
${data.identifier}: ${data.title}
${"=".repeat(60)}

Status:       ${data.status}
Priority:     ${data.priorityLabel}
Team:         ${data.team ?? "None"}
Project:      ${data.project ?? "None"}
Assignee:     ${data.assignee ?? "Unassigned"}
Labels:       ${data.labels.length > 0 ? data.labels.join(", ") : "None"}
Comments:     ${data.commentCount}

Created:      ${new Date(data.createdAt).toLocaleString()}
Updated:      ${new Date(data.updatedAt).toLocaleString()}

URL:          ${data.url}

Description:
${"-".repeat(60)}
${data.description ?? "(No description)"}
`);
  }
}

main().catch((e) => error(e.message));
