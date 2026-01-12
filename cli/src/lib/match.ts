import type { SkillWithRegistry } from "../lib/registry.ts";

/**
 * Convert a simple glob pattern to a regex.
 * Supports * as wildcard (matches any characters).
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*/g, ".*"); // Convert * to .*
  return new RegExp(`^${escaped}$`);
}

/**
 * Match skills by name, domain, or glob pattern.
 * Returns matching skills for a given pattern.
 */
export function matchSkills(
  pattern: string,
  allSkills: SkillWithRegistry[],
  domains: string[]
): SkillWithRegistry[] {
  // Check if it's a domain name
  if (domains.includes(pattern)) {
    return allSkills.filter((s) => (s.domain ?? "other") === pattern);
  }

  // Check if it contains a wildcard
  if (pattern.includes("*")) {
    const regex = globToRegex(pattern);
    return allSkills.filter((s) => regex.test(s.name));
  }

  // Exact skill name match
  const skill = allSkills.find((s) => s.name === pattern);
  return skill ? [skill] : [];
}
