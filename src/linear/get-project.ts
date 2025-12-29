#!/usr/bin/env bun
/**
 * Get details for a single Linear project
 *
 * Usage:
 *   bun run get-project.ts <project-id-or-name>
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
Get details for a single Linear project

Usage:
  bun run get-project.ts <project-id-or-name>

Arguments:
  project-id-or-name    Project UUID or name (partial match)

Options:
  --json      Output as JSON

Examples:
  bun run get-project.ts "Auth Server"
  bun run get-project.ts a83a44de-c54a-47e8-be1c-7c9217c63379 --json
`);
  process.exit(0);
}

const projectInput = positional[0];
if (!projectInput) {
  error("Project ID or name is required. Usage: bun run get-project.ts <project-id-or-name>");
}

const jsonOutput = flags.json === true;

async function main() {
  let project;

  if (projectInput.match(/^[0-9a-f-]{36}$/i)) {
    // It's a UUID
    project = await linear.project(projectInput);
  } else {
    // Search by name
    const projects = await linear.projects({
      filter: { name: { containsIgnoreCase: projectInput } },
      first: 1,
    });
    if (projects.nodes.length > 0) {
      project = projects.nodes[0];
    }
  }

  if (!project) {
    error(`Project not found: ${projectInput}`);
  }

  const lead = await project.lead;
  const status = await project.status;
  const teams = await project.teams();
  const milestones = await project.projectMilestones();
  const issues = await project.issues({ first: 100 });

  const data = {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    status: status?.name ?? "Unknown",
    lead: lead?.name ?? null,
    teams: teams.nodes.map((t) => t.name),
    progress: Math.round(project.progress * 100),
    startDate: project.startDate ?? null,
    targetDate: project.targetDate ?? null,
    milestones: milestones.nodes.map((m) => ({
      id: m.id,
      name: m.name,
      targetDate: m.targetDate ?? null,
    })),
    issueCount: issues.nodes.length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    url: project.url,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
${data.name}
${"=".repeat(60)}

Status:       ${data.status}
Progress:     ${data.progress}%
Lead:         ${data.lead ?? "None"}
Teams:        ${data.teams.length > 0 ? data.teams.join(", ") : "None"}

Start Date:   ${data.startDate ?? "Not set"}
Target Date:  ${data.targetDate ?? "Not set"}

Issues:       ${data.issueCount}
Milestones:   ${data.milestones.length}
${data.milestones.length > 0 ? "\n  " + data.milestones.map((m) => `- ${m.name}${m.targetDate ? ` (${m.targetDate})` : ""}`).join("\n  ") : ""}

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
