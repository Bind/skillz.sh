#!/usr/bin/env bun
/**
 * Update an existing Linear project
 *
 * Usage:
 *   bun run update-project.ts <project-id-or-name> [options]
 *
 * Options:
 *   --name <name>           New project name
 *   --description <desc>    New description
 *   --lead <name>           Project lead (use "none" to remove)
 *   --status <status>       Status (planned, started, paused, completed, canceled)
 *   --start-date <date>     Start date (YYYY-MM-DD)
 *   --target-date <date>    Target date (YYYY-MM-DD)
 *   --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=normal, 4=low)
 *   --json                  Output as JSON
 *   --help                  Show this help
 */

import { linear, resolveUserId } from "../../utils/linear";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Update an existing Linear project

Usage:
  bun run update-project.ts <project-id-or-name> [options]

Arguments:
  project-id-or-name    Project UUID or name (partial match)

Options:
  --name <name>           New project name
  --description <desc>    New description
  --lead <name>           Project lead (use "none" to remove)
  --status <status>       Status (planned, started, paused, completed, canceled)
  --start-date <date>     Start date (YYYY-MM-DD)
  --target-date <date>    Target date (YYYY-MM-DD)
  --priority <0-4>        Priority (0=none, 1=urgent, 2=high, 3=normal, 4=low)
  --json                  Output as JSON

Examples:
  bun run update-project.ts "Louisiana Purchase" --status started
  bun run update-project.ts "Louisiana Purchase" --lead "James Monroe" --target-date 1803-12-20
`);
  process.exit(0);
}

const projectInput = positional[0];
if (!projectInput) {
  error("Project ID or name is required. Usage: bun run update-project.ts <project-id-or-name> [options]");
}

const jsonOutput = flags.json === true;

async function findProject(input: string) {
  if (input.match(/^[0-9a-f-]{36}$/i)) {
    return await linear.project(input);
  }

  const projects = await linear.projects({
    filter: { name: { containsIgnoreCase: input } },
    first: 1,
  });
  return projects.nodes.length > 0 ? projects.nodes[0] : null;
}

async function main() {
  const project = await findProject(projectInput);
  if (!project) {
    error(`Project not found: ${projectInput}`);
  }

  const input: {
    name?: string;
    description?: string;
    leadId?: string | null;
    statusId?: string;
    startDate?: string;
    targetDate?: string;
    priority?: number;
  } = {};

  if (typeof flags.name === "string") {
    input.name = flags.name;
  }

  if (typeof flags.description === "string") {
    input.description = flags.description;
  }

  if (typeof flags.lead === "string") {
    if (flags.lead.toLowerCase() === "none") {
      input.leadId = null;
    } else {
      try {
        input.leadId = await resolveUserId(flags.lead);
      } catch (e) {
        error((e as Error).message);
      }
    }
  }

  if (typeof flags.status === "string") {
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

  if (Object.keys(input).length === 0) {
    error("No updates specified. Use --help to see available options.");
  }

  const payload = await linear.updateProject(project.id, input);

  if (!payload.success) {
    error("Failed to update project");
  }

  const updated = await payload.project;
  if (!updated) {
    error("Project updated but could not fetch details");
  }

  const status = await updated.status;
  const lead = await updated.lead;

  const data = {
    id: updated.id,
    name: updated.name,
    status: status?.name ?? "Unknown",
    lead: lead?.name ?? null,
    startDate: updated.startDate ?? null,
    targetDate: updated.targetDate ?? null,
    url: updated.url,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
Project updated successfully!

  ${data.name}
  Status: ${data.status}
  Lead: ${data.lead ?? "None"}
  Start: ${data.startDate ?? "Not set"}
  Target: ${data.targetDate ?? "Not set"}
  ${data.url}
`);
  }
}

main().catch((e) => error(e.message));
