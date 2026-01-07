#!/usr/bin/env bun
/**
 * List Linear issues with optional filtering
 *
 * Usage:
 *   bun run list-issues.ts [options]
 *
 * Options:
 *   --team <name>       Filter by team name (e.g., Engineering)
 *   --project <name>    Filter by project name
 *   --assignee <name>   Filter by assignee name
 *   --status <status>   Filter by status (e.g., "In Progress", "Todo")
 *   --limit <n>         Number of issues to fetch (default: 25)
 *   --json              Output as JSON
 *   --help              Show this help
 */

import { linear, resolveTeamId, resolveUserId } from "../../utils/linear";
import { parseArgs, formatTable, error } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
List Linear issues with optional filtering

Usage:
  bun run list-issues.ts [options]

Options:
  --team <name>       Filter by team name (e.g., Engineering)
  --project <name>    Filter by project name
  --assignee <name>   Filter by assignee name
  --status <status>   Filter by status (e.g., "In Progress", "Todo")
  --limit <n>         Number of issues to fetch (default: 25)
  --json              Output as JSON

Examples:
  bun run list-issues.ts --team Engineering --limit 10
  bun run list-issues.ts --assignee "George Washington" --status "In Progress"
  bun run list-issues.ts --project "Constitutional Convention" --json
`);
  process.exit(0);
}

const limit = typeof flags.limit === "string" ? parseInt(flags.limit, 10) : 25;
const jsonOutput = flags.json === true;

interface IssueFilter {
  team?: { id: { eq: string } };
  project?: { name: { containsIgnoreCase: string } };
  assignee?: { id: { eq: string } };
  state?: { name: { containsIgnoreCase: string } };
}

async function main() {
  const filter: IssueFilter = {};

  if (typeof flags.team === "string") {
    try {
      filter.team = { id: { eq: await resolveTeamId(flags.team) } };
    } catch (e) {
      error((e as Error).message);
    }
  }

  if (typeof flags.project === "string") {
    filter.project = { name: { containsIgnoreCase: flags.project } };
  }

  if (typeof flags.assignee === "string") {
    try {
      filter.assignee = { id: { eq: await resolveUserId(flags.assignee) } };
    } catch (e) {
      error((e as Error).message);
    }
  }

  if (typeof flags.status === "string") {
    filter.state = { name: { containsIgnoreCase: flags.status } };
  }

  const issues = await linear.issues({
    first: limit,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  const rows = await Promise.all(
    issues.nodes.map(async (issue) => {
      const state = await issue.state;
      const assignee = await issue.assignee;
      const team = await issue.team;
      return {
        id: issue.identifier,
        title: issue.title,
        status: state?.name ?? "Unknown",
        assignee: assignee?.name ?? "Unassigned",
        team: team?.name ?? "Unknown",
        priority: issue.priority ?? 0,
        url: issue.url,
      };
    })
  );

  if (jsonOutput) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(
      formatTable(rows, [
        { key: "id", header: "ID", width: 10 },
        { key: "title", header: "Title", width: 45 },
        { key: "status", header: "Status", width: 15 },
        { key: "assignee", header: "Assignee", width: 18 },
        { key: "team", header: "Team", width: 14 },
      ])
    );
    console.log(`\nShowing ${rows.length} issues`);
  }
}

main().catch((e) => error(e.message));
