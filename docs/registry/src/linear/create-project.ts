#!/usr/bin/env bun
/**
 * Create a new Linear project
 *
 * Usage:
 *   bun run create-project.ts --name "Project name" --teams Engineering [options]
 *
 * Options:
 *   --name <name>           Project name (required)
 *   --teams <teams>         Comma-separated team names (required)
 *   --description <desc>    Project description
 *   --lead <name>           Project lead name
 *   --status <status>       Status (planned, started, paused, completed, canceled)
 *   --start-date <date>     Start date (YYYY-MM-DD)
 *   --target-date <date>    Target date (YYYY-MM-DD)
 *   --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=normal, 4=low)
 *   --json                  Output as JSON
 *   --help                  Show this help
 */

import { linear, resolveTeamId, resolveUserId } from "../../utils/linear";
import { parseArgs, error } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Create a new Linear project

Usage:
  bun run create-project.ts --name "Project name" --teams Engineering [options]

Options:
  --name <name>           Project name (required)
  --teams <teams>         Comma-separated team names (required)
  --description <desc>    Project description
  --lead <name>           Project lead name
  --status <status>       Status (planned, started, paused, completed, canceled)
  --start-date <date>     Start date (YYYY-MM-DD)
  --target-date <date>    Target date (YYYY-MM-DD)
  --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=normal, 4=low)
  --json                  Output as JSON

Examples:
  bun run create-project.ts --name "Louisiana Purchase" --teams Engineering
  bun run create-project.ts --name "National Bank" --teams "Engineering,Product" --lead "Alexander Hamilton"
`);
  process.exit(0);
}

const name = flags.name;
const teams = flags.teams;

if (typeof name !== "string" || !name.trim()) {
  error("--name is required");
}

if (typeof teams !== "string" || !teams.trim()) {
  error("--teams is required");
}

const jsonOutput = flags.json === true;

async function main() {
  // Resolve team IDs
  let teamIds: string[];
  try {
    teamIds = await Promise.all(
      (teams as string).split(",").map((t) => resolveTeamId(t.trim()))
    );
  } catch (e) {
    error((e as Error).message);
  }

  const input: {
    name: string;
    teamIds: string[];
    description?: string;
    leadId?: string;
    statusId?: string;
    startDate?: string;
    targetDate?: string;
    priority?: number;
  } = {
    name: (name as string).trim(),
    teamIds,
  };

  if (typeof flags.description === "string") {
    input.description = flags.description;
  }

  if (typeof flags.lead === "string") {
    try {
      input.leadId = await resolveUserId(flags.lead);
    } catch (e) {
      error((e as Error).message);
    }
  }

  if (typeof flags.status === "string") {
    // Get available project statuses
    const org = await linear.client.organization;
    const statuses = org.projectStatuses;
    const status = statuses.find(
      (s) => s.name.toLowerCase() === flags.status.toLowerCase()
    );
    if (!status) {
      const validStatuses = statuses.map((s) => s.name).join(", ");
      error(`Invalid status: ${flags.status}. Valid: ${validStatuses}`);
    }
    input.statusId = status.id;
  }

  if (typeof flags["start-date"] === "string") {
    if (!flags["start-date"].match(/^\d{4}-\d{2}-\d{2}$/)) {
      error("start-date must be in YYYY-MM-DD format");
    }
    input.startDate = flags["start-date"];
  }

  if (typeof flags["target-date"] === "string") {
    if (!flags["target-date"].match(/^\d{4}-\d{2}-\d{2}$/)) {
      error("target-date must be in YYYY-MM-DD format");
    }
    input.targetDate = flags["target-date"];
  }

  if (typeof flags.priority === "string") {
    const p = parseInt(flags.priority, 10);
    if (isNaN(p) || p < 0 || p > 4) {
      error("Priority must be 0-4 (0=none, 1=urgent, 2=high, 3=normal, 4=low)");
    }
    input.priority = p;
  }

  const payload = await linear.createProject(input);

  if (!payload.success) {
    error("Failed to create project");
  }

  const project = await payload.project;
  if (!project) {
    error("Project created but could not fetch details");
  }

  const data = {
    id: project.id,
    name: project.name,
    url: project.url,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
Project created successfully!

  ${data.name}
  ${data.url}
`);
  }
}

main().catch((e) => error(e.message));
