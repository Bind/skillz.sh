#!/usr/bin/env bun
/**
 * List Linear projects with optional filtering
 *
 * Usage:
 *   bun run list-projects.ts [options]
 *
 * Options:
 *   --status <status>   Filter by status (planned, started, paused, completed, canceled)
 *   --lead <name>       Filter by project lead name
 *   --limit <n>         Number of projects to fetch (default: 25)
 *   --json              Output as JSON
 *   --help              Show this help
 */

import { linear, resolveUserId } from "../../utils/linear";
import { parseArgs, formatTable, error } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
List Linear projects with optional filtering

Usage:
  bun run list-projects.ts [options]

Options:
  --status <status>   Filter by status (planned, started, paused, completed, canceled)
  --lead <name>       Filter by project lead name
  --limit <n>         Number of projects to fetch (default: 25)
  --json              Output as JSON

Examples:
  bun run list-projects.ts --limit 10
  bun run list-projects.ts --status started
  bun run list-projects.ts --lead "John Adams" --json
`);
  process.exit(0);
}

const limit = typeof flags.limit === "string" ? parseInt(flags.limit, 10) : 25;
const jsonOutput = flags.json === true;

interface ProjectFilter {
  status?: { name: { containsIgnoreCase: string } };
  lead?: { id: { eq: string } };
}

async function main() {
  const filter: ProjectFilter = {};

  if (typeof flags.status === "string") {
    filter.status = { name: { containsIgnoreCase: flags.status } };
  }

  if (typeof flags.lead === "string") {
    try {
      filter.lead = { id: { eq: await resolveUserId(flags.lead) } };
    } catch (e) {
      error((e as Error).message);
    }
  }

  const projects = await linear.projects({
    first: limit,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  const rows = await Promise.all(
    projects.nodes.map(async (project) => {
      const lead = await project.lead;
      const status = await project.status;
      const teams = await project.teams();
      return {
        id: project.id.slice(0, 8),
        name: project.name,
        status: status?.name ?? "Unknown",
        lead: lead?.name ?? "None",
        teams: teams.nodes.map((t) => t.name).join(", ") || "None",
        targetDate: project.targetDate ?? "None",
        progress: `${Math.round(project.progress * 100)}%`,
        url: project.url,
      };
    })
  );

  if (jsonOutput) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(
      formatTable(rows, [
        { key: "name", header: "Name", width: 35 },
        { key: "status", header: "Status", width: 12 },
        { key: "lead", header: "Lead", width: 18 },
        { key: "progress", header: "Progress", width: 10 },
        { key: "targetDate", header: "Target", width: 12 },
      ])
    );
    console.log(`\nShowing ${rows.length} projects`);
  }
}

main().catch((e) => error(e.message));
