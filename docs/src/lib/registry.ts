import type { Registry } from "../types/registry.ts";

export async function loadRegistry(): Promise<Registry> {
  const response = await fetch("/registry.json");
  return response.json() as Promise<Registry>;
}

export function groupSkillsByDomain(skills: Registry["skills"]): Map<string, typeof skills> {
  const byDomain = new Map<string, typeof skills>();
  for (const skill of skills) {
    const domain = skill.domain ?? "other";
    const list = byDomain.get(domain) ?? [];
    list.push(skill);
    byDomain.set(domain, list);
  }
  return byDomain;
}

export function sortDomains(domains: string[]): string[] {
  return [...domains].sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  });
}
