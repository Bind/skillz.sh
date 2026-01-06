#!/usr/bin/env bun
/**
 * List Linear project milestones
 *
 * Usage:
 *   bun run list-milestones.ts [options]
 *
 * Options:
 *   --project <name>    Filter by project name (required unless --all)
 *   --all               List milestones across all projects
 *   --limit <n>         Number of milestones to fetch (default: 25)
 *   --json              Output as JSON
 *   --help              Show this help
 */

import { linear } from "../../utils/linear";
import { parseArgs, formatTable, error } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
List Linear project milestones

Usage:
  bun run list-milestones.ts [options]

Options:
  --project <name>    Filter by project name
  --all               List milestones across all projects
  --limit <n>         Number of milestones to fetch (default: 25)
  --json              Output as JSON

Examples:
  bun run list-milestones.ts --project "Auth Server"
  bun run list-milestones.ts --all --limit 10
  bun run list-milestones.ts --project "DeFi Trading" --json
`);
  process.exit(0);
}

const limit = typeof flags.limit === "string" ? parseInt(flags.limit, 10) : 25;
const jsonOutput = flags.json === true;

if (typeof flags.project !== "string" && flags.all !== true) {
  error("Either --project <name> or --all is required");
}

async function main() {
  let milestones;

  if (typeof flags.project === "string") {
    // Find project first
    const projects = await linear.projects({
      filter: { name: { containsIgnoreCase: flags.project } },
      first: 1,
    });

    if (projects.nodes.length === 0) {
      error(`Project not found: ${flags.project}`);
    }

    const project = projects.nodes[0];
    milestones = await project.projectMilestones({ first: limit });
  } else {
    // Get all milestones
    milestones = await linear.projectMilestones({ first: limit });
  }

  const rows = await Promise.all(
    milestones.nodes.map(async (milestone) => {
      const project = await milestone.project;
      return {
        id: milestone.id.slice(0, 8),
        name: milestone.name,
        project: project?.name ?? "Unknown",
        targetDate: milestone.targetDate ?? "Not set",
        description: milestone.description?.slice(0, 50) ?? "",
      };
    })
  );

  if (jsonOutput) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(
      formatTable(rows, [
        { key: "name", header: "Milestone", width: 30 },
        { key: "project", header: "Project", width: 25 },
        { key: "targetDate", header: "Target Date", width: 12 },
        { key: "description", header: "Description", width: 30 },
      ])
    );
    console.log(`\nShowing ${rows.length} milestones`);
  }
}

main().catch((e) => error(e.message));
