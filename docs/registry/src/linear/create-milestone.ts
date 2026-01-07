#!/usr/bin/env bun
/**
 * Create a new milestone for a Linear project
 *
 * Usage:
 *   bun run create-milestone.ts --name "Milestone name" --project "Project name" [options]
 *
 * Options:
 *   --name <name>           Milestone name (required)
 *   --project <name>        Project name or ID (required)
 *   --description <desc>    Milestone description
 *   --target-date <date>    Target date (YYYY-MM-DD)
 *   --json                  Output as JSON
 *   --help                  Show this help
 */

import { linear } from "../../utils/linear";
import { parseArgs, error } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Create a new milestone for a Linear project

Usage:
  bun run create-milestone.ts --name "Milestone name" --project "Project name" [options]

Options:
  --name <name>           Milestone name (required)
  --project <name>        Project name or ID (required)
  --description <desc>    Milestone description
  --target-date <date>    Target date (YYYY-MM-DD)
  --json                  Output as JSON

Examples:
  bun run create-milestone.ts --name "Alpha Release" --project "Auth Server"
  bun run create-milestone.ts --name "Beta" --project "DeFi Trading" --target-date 2025-02-01
`);
  process.exit(0);
}

const name = flags.name;
const projectInput = flags.project;

if (typeof name !== "string" || !name.trim()) {
  error("--name is required");
}

if (typeof projectInput !== "string" || !projectInput.trim()) {
  error("--project is required");
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
  const project = await findProject(projectInput as string);
  if (!project) {
    error(`Project not found: ${projectInput}`);
  }

  const input: {
    name: string;
    projectId: string;
    description?: string;
    targetDate?: string;
  } = {
    name: (name as string).trim(),
    projectId: project.id,
  };

  if (typeof flags.description === "string") {
    input.description = flags.description;
  }

  if (typeof flags["target-date"] === "string") {
    if (!flags["target-date"].match(/^\d{4}-\d{2}-\d{2}$/)) {
      error("target-date must be in YYYY-MM-DD format");
    }
    input.targetDate = flags["target-date"];
  }

  const payload = await linear.createProjectMilestone(input);

  if (!payload.success) {
    error("Failed to create milestone");
  }

  const milestone = await payload.projectMilestone;
  if (!milestone) {
    error("Milestone created but could not fetch details");
  }

  const data = {
    id: milestone.id,
    name: milestone.name,
    project: project.name,
    targetDate: milestone.targetDate ?? null,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
Milestone created successfully!

  ${data.name}
  Project: ${data.project}
  Target: ${data.targetDate ?? "Not set"}
`);
  }
}

main().catch((e) => error(e.message));
