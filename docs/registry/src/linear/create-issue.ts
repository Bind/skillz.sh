#!/usr/bin/env bun
/**
 * Create a new Linear issue
 *
 * Usage:
 *   bun run create-issue.ts --title "Issue title" --team Engineering [options]
 *
 * Options:
 *   --title <title>         Issue title (required)
 *   --team <name>           Team name (required)
 *   --description <desc>    Issue description
 *   --assignee <name>       Assignee name
 *   --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)
 *   --labels <labels>       Comma-separated label names
 *   --project <name>        Project name
 *   --json                  Output as JSON
 *   --help                  Show this help
 */

import { linear, resolveTeamId, resolveLabelId, resolveUserId } from "../../utils/linear";
import { parseArgs, error } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Create a new Linear issue

Usage:
  bun run create-issue.ts --title "Issue title" --team Engineering [options]

Options:
  --title <title>         Issue title (required)
  --team <name>           Team name (required)
  --description <desc>    Issue description
  --assignee <name>       Assignee name
  --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)
  --labels <labels>       Comma-separated label names (e.g., "Bug,SOC2")
  --project <name>        Project name
  --json                  Output as JSON

Examples:
  bun run create-issue.ts --title "Fix login bug" --team Engineering --priority 2
  bun run create-issue.ts --title "Draft Bill of Rights" --team Engineering --labels "Feature" --assignee "James Madison"
`);
  process.exit(0);
}

const title = flags.title;
const team = flags.team;

if (typeof title !== "string" || !title.trim()) {
  error("--title is required");
}

if (typeof team !== "string" || !team.trim()) {
  error("--team is required");
}

const jsonOutput = flags.json === true;

async function main() {
  let teamId: string;
  try {
    teamId = await resolveTeamId(team as string);
  } catch (e) {
    error((e as Error).message);
  }

  const input: {
    title: string;
    teamId: string;
    description?: string;
    assigneeId?: string;
    priority?: number;
    labelIds?: string[];
    projectId?: string;
  } = {
    title: (title as string).trim(),
    teamId,
  };

  if (typeof flags.description === "string") {
    input.description = flags.description;
  }

  if (typeof flags.assignee === "string") {
    try {
      input.assigneeId = await resolveUserId(flags.assignee);
    } catch (e) {
      error((e as Error).message);
    }
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

  if (typeof flags.project === "string") {
    // Look up project by name
    const projects = await linear.projects({
      filter: { name: { containsIgnoreCase: flags.project } },
      first: 1,
    });
    if (projects.nodes.length === 0) {
      error(`Project not found: ${flags.project}`);
    }
    input.projectId = projects.nodes[0].id;
  }

  const payload = await linear.createIssue(input);

  if (!payload.success) {
    error("Failed to create issue");
  }

  const issue = await payload.issue;
  if (!issue) {
    error("Issue created but could not fetch details");
  }

  const data = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
Issue created successfully!

  ${data.identifier}: ${data.title}
  ${data.url}
`);
  }
}

main().catch((e) => error(e.message));
