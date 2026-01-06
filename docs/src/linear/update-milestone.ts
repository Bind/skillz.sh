#!/usr/bin/env bun
/**
 * Update an existing Linear project milestone
 *
 * Usage:
 *   bun run update-milestone.ts <milestone-id> [options]
 *
 * Options:
 *   --name <name>           New milestone name
 *   --description <desc>    New description
 *   --target-date <date>    Target date (YYYY-MM-DD)
 *   --json                  Output as JSON
 *   --help                  Show this help
 */

import { linear } from "../../utils/linear";
import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Update an existing Linear project milestone

Usage:
  bun run update-milestone.ts <milestone-id> [options]

Arguments:
  milestone-id    Milestone UUID

Options:
  --name <name>           New milestone name
  --description <desc>    New description
  --target-date <date>    Target date (YYYY-MM-DD)
  --json                  Output as JSON

Examples:
  bun run update-milestone.ts abc123 --name "Beta Release"
  bun run update-milestone.ts abc123 --target-date 2025-03-15
`);
  process.exit(0);
}

const milestoneId = positional[0];
if (!milestoneId) {
  error("Milestone ID is required. Usage: bun run update-milestone.ts <milestone-id> [options]");
}

const jsonOutput = flags.json === true;

async function main() {
  // Verify milestone exists
  const milestone = await linear.projectMilestone(milestoneId);
  if (!milestone) {
    error(`Milestone not found: ${milestoneId}`);
  }

  const input: {
    name?: string;
    description?: string;
    targetDate?: string;
  } = {};

  if (typeof flags.name === "string") {
    input.name = flags.name;
  }

  if (typeof flags.description === "string") {
    input.description = flags.description;
  }

  if (typeof flags["target-date"] === "string") {
    if (!flags["target-date"].match(/^\d{4}-\d{2}-\d{2}$/)) {
      error("target-date must be in YYYY-MM-DD format");
    }
    input.targetDate = flags["target-date"];
  }

  if (Object.keys(input).length === 0) {
    error("No updates specified. Use --help to see available options.");
  }

  const payload = await linear.updateProjectMilestone(milestoneId, input);

  if (!payload.success) {
    error("Failed to update milestone");
  }

  const updated = await payload.projectMilestone;
  if (!updated) {
    error("Milestone updated but could not fetch details");
  }

  const project = await updated.project;

  const data = {
    id: updated.id,
    name: updated.name,
    project: project?.name ?? "Unknown",
    targetDate: updated.targetDate ?? null,
    description: updated.description ?? null,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`
Milestone updated successfully!

  ${data.name}
  Project: ${data.project}
  Target: ${data.targetDate ?? "Not set"}
`);
  }
}

main().catch((e) => error(e.message));
