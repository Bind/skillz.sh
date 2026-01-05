import { findConfig } from "../lib/config.ts";
import { fetchAllSkills } from "../lib/registry.ts";
import type { RegistrySkill } from "../types.ts";

export async function list(): Promise<void> {
  const configResult = await findConfig();

  if (!configResult) {
    console.error("No skz.json found. Run `skz init` first.");
    process.exit(1);
  }

  const { config } = configResult;

  console.log("\nFetching skills from registries...\n");

  const skills = await fetchAllSkills(config.registries);

  if (skills.length === 0) {
    console.log("No skills found in configured registries.");
    return;
  }

  // Group skills by domain
  const grouped = new Map<string, RegistrySkill[]>();
  for (const skill of skills) {
    const domain = skill.domain ?? "other";
    const list = grouped.get(domain) ?? [];
    list.push(skill);
    grouped.set(domain, list);
  }

  // Sort domains alphabetically, but put "other" last
  const domains = [...grouped.keys()].sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  });

  // Calculate column widths
  const nameWidth = Math.max(...skills.map((s) => s.name.length), 4);
  const versionWidth = Math.max(...skills.map((s) => s.version.length), 7);

  // Print skills grouped by domain
  for (const domain of domains) {
    const domainSkills = grouped.get(domain)!;
    
    // Print domain header
    console.log(`${domain.toUpperCase()}`);
    console.log("-".repeat(domain.length));

    // Print skills in this domain
    for (const skill of domainSkills) {
      console.log(
        `  ${skill.name.padEnd(nameWidth)}  ${skill.version.padEnd(versionWidth)}  ${skill.description}`
      );
    }
    console.log();
  }

  console.log(`${skills.length} skill(s) available\n`);
}
