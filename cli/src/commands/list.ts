import { readConfig } from "../lib/config.ts";
import { fetchAllSkills } from "../lib/registry.ts";

export async function list(): Promise<void> {
  const config = await readConfig();

  if (!config) {
    console.error("No skz.json found. Run `skz init` first.");
    process.exit(1);
  }

  console.log("\nFetching skills from registries...\n");

  const skills = await fetchAllSkills(config.registries);

  if (skills.length === 0) {
    console.log("No skills found in configured registries.");
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(...skills.map((s) => s.name.length), 4);
  const versionWidth = Math.max(...skills.map((s) => s.version.length), 7);
  const descWidth = Math.max(...skills.map((s) => s.description.length), 11);

  // Print header
  const header = `${"NAME".padEnd(nameWidth)}  ${"VERSION".padEnd(versionWidth)}  ${"DESCRIPTION".padEnd(descWidth)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  // Print skills
  for (const skill of skills) {
    console.log(
      `${skill.name.padEnd(nameWidth)}  ${skill.version.padEnd(versionWidth)}  ${skill.description}`
    );
  }

  console.log(`\n${skills.length} skill(s) available\n`);
}
