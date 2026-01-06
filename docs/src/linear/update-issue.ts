#!/usr/bin/env bun
/**
 * Update an existing Linear issue
 *
 * Usage:
 *   bun run update-issue.ts <issue-id> [options]
 *
 * Options:
 *   --title <title>         New title
 *   --description <desc>    New description
 *   --assignee <name>       Assignee name (use "none" to unassign)
 *   --status <status>       Status name (e.g., "In Progress", "Done")
 *   --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)
 *   --labels <labels>       Comma-separated label names (replaces existing)
 *   --add-labels <labels>   Add labels without removing existing
 *   --project <name>        Project name (use "none" to remove)
 *   --json                  Output as JSON
 *   --help                  Show this help
 */

import { linear, resolveLabelId, resolveUserId } from "../../utils/linear";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Update an existing Linear issue

Usage:
  bun run update-issue.ts <issue-id> [options]

Arguments:
  issue-id    Issue identifier (e.g., ENG-123) or UUID

Options:
  --title <title>         New title
  --description <desc>    New description
  --assignee <name>       Assignee name (use "none" to unassign)
  --status <status>       Status name (e.g., "In Progress", "Done")
  --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)
  --labels <labels>       Comma-separated label names (replaces existing)
  --add-labels <labels>   Add labels without removing existing
  --project <name>        Project name (use "none" to remove)
  --json                  Output as JSON

Examples:
  bun run update-issue.ts ENG-123 --status "In Progress"
  bun run update-issue.ts ENG-123 --assignee "Thomas Jefferson" --priority 2
  bun run update-issue.ts ENG-123 --add-labels "Bug,SOC2"
`);
  process.exit(0);
}

const issueId = positional[0];
if (!issueId) {
  error("Issue ID is required. Usage: bun run update-issue.ts <issue-id> [options]");
}

const jsonOutput = flags.json === true;

async function findIssue(identifier: string) {
  if (identifier.match(/^[0-9a-f-]{36}$/i)) {
    return await linear.issue(identifier);
  }

  // Search by identifier
  const searchResult = await linear.searchIssues(identifier, { first: 1 });
  if (searchResult.nodes.length > 0) {
    return searchResult.nodes[0];
  }

  return null;
}

async function main() {
  const issue = await findIssue(issueId);
  if (!issue) {
    error(`Issue not found: ${issueId}`);
  }

  const input: {
    title?: string;
    description?: string;
    assigneeId?: string | null;
    stateId?: string;
    priority?: number;
    labelIds?: string[];
    projectId?: string | null;
  } = {};

  if (typeof flags.title === "string") {
    input.title = flags.title;
  }

  if (typeof flags.description === "string") {
    input.description = flags.description;
  }

  if (typeof flags.assignee === "string") {
    if (flags.assignee.toLowerCase() === "none") {
      input.assigneeId = null;
    } else {
      try {
        input.assigneeId = await resolveUserId(flags.assignee);
      } catch (e) {
        error((e as Error).message);
      }
    }
  }

  if (typeof flags.status === "string") {
    // Look up state by name
    const team = await issue.team;
    if (!team) {
      error("Could not determine issue team");
    }
    const states = await team.states();
    const state = states.nodes.find(
      (s) => s.name.toLowerCase() === flags.status.toLowerCase()
    );
    if (!state) {
      const validStates = states.nodes.map((s) => s.name).join(", ");
      error(`Status not found: ${flags.status}. Valid statuses: ${validStates}`);
    }
    input.stateId = state.id;
  }

  if (typeof flags.priority === "string") {
    const p = parseInt(flags.priority, 10);
    if (isNaN(p) || p < 0 || p > 4) {
      error("Priority must be 0-4 (0=none, 1=urgent, 2=high, 3=medium, 4=low)");
    }
    input.priority = p;
  }

  if (typeof flags.labels === "string") {
    try {
      input.labelIds = await Promise.all(
        flags.labels.split(",").map((l) => resolveLabelId(l.trim()))
      );
    } catch (e) {
      error((e as Error).message);
    }
  }

  if (typeof flags["add-labels"] === "string") {
    try {
      const existingLabels = await issue.labels();
      const existingIds = existingLabels.nodes.map((l) => l.id);
      const newIds = await Promise.all(
        flags["add-labels"].split(",").map((l) => resolveLabelId(l.trim()))
      );
      input.labelIds = [...new Set([...existingIds, ...newIds])];
    } catch (e) {
      error((e as Error).message);
    }
  }

  if (typeof flags.project === "string") {
    if (flags.project.toLowerCase() === "none") {
      input.projectId = null;
    } else {
      const projects = await linear.projects({
        filter: { name: { containsIgnoreCase: flags.project } },
        first: 1,
      });
      if (projects.nodes.length === 0) {
        error(`Project not found: ${flags.project}`);
      }
      input.projectId = projects.nodes[0].id;
    }
  }

  if (Object.keys(input).length === 0) {
    error("No updates specified. Use --help to see available options.");
  }

  const payload = await linear.updateIssue(issue.id, input);

  if (!payload.success) {
    error("Failed to update issue");
  }

  const updated = await payload.issue;
  if (!updated) {
    error("Issue updated but could not fetch details");
  }

  const state = await updated.state;
  const assignee = await updated.assignee;

  const data = {
    id: updated.id,
    identifier: updated.identifier,
    title: updated.title,
    status: state?.name ?? "Unknown",
    assignee: assignee?.name ?? null,
    priority: updated.priorityLabel ?? "None",
    url: updated.url,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
Issue updated successfully!

  ${data.identifier}: ${data.title}
  Status: ${data.status}
  Priority: ${data.priority}
  Assignee: ${data.assignee ?? "Unassigned"}
  ${data.url}
`);
  }
}

main().catch((e) => error(e.message));
