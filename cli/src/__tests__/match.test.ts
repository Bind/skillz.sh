import { describe, expect, test } from "bun:test";
import { globToRegex, matchSkills } from "../lib/match.ts";
import type { SkillWithRegistry } from "../lib/registry.ts";

// Mock skills for testing
const mockSkills: SkillWithRegistry[] = [
  {
    name: "linear-issues-read",
    description: "Read Linear issues",
    version: "1.0.0",
    domain: "linear",
    files: { skill: ["SKILL.md"] },
    registry: "https://skillz.sh",
    registryName: "skillz.sh",
  },
  {
    name: "linear-issues-write",
    description: "Write Linear issues",
    version: "1.0.0",
    domain: "linear",
    files: { skill: ["SKILL.md"] },
    registry: "https://skillz.sh",
    registryName: "skillz.sh",
  },
  {
    name: "linear-projects-read",
    description: "Read Linear projects",
    version: "1.0.0",
    domain: "linear",
    files: { skill: ["SKILL.md"] },
    registry: "https://skillz.sh",
    registryName: "skillz.sh",
  },
  {
    name: "linear-projects-write",
    description: "Write Linear projects",
    version: "1.0.0",
    domain: "linear",
    files: { skill: ["SKILL.md"] },
    registry: "https://skillz.sh",
    registryName: "skillz.sh",
  },
  {
    name: "github-pr",
    description: "GitHub PR utilities",
    version: "1.0.0",
    domain: "github",
    files: { skill: ["SKILL.md"] },
    registry: "https://skillz.sh",
    registryName: "skillz.sh",
  },
  {
    name: "code-review",
    description: "Code review",
    version: "1.0.0",
    domain: "github",
    files: { skill: ["SKILL.md"] },
    registry: "https://skillz.sh",
    registryName: "skillz.sh",
  },
  {
    name: "tmux",
    description: "Tmux control",
    version: "1.0.0",
    domain: "terminal",
    files: { skill: ["SKILL.md"] },
    registry: "https://skillz.sh",
    registryName: "skillz.sh",
  },
];

const domains = ["linear", "github", "terminal"];

describe("globToRegex", () => {
  test("converts * to match any characters", () => {
    const regex = globToRegex("linear-*");
    expect(regex.test("linear-issues-read")).toBe(true);
    expect(regex.test("linear-projects-write")).toBe(true);
    expect(regex.test("github-pr")).toBe(false);
  });

  test("matches exact strings without wildcards", () => {
    const regex = globToRegex("linear-issues-read");
    expect(regex.test("linear-issues-read")).toBe(true);
    expect(regex.test("linear-issues-write")).toBe(false);
  });

  test("supports multiple wildcards", () => {
    const regex = globToRegex("*-*-read");
    expect(regex.test("linear-issues-read")).toBe(true);
    expect(regex.test("linear-projects-read")).toBe(true);
    expect(regex.test("linear-issues-write")).toBe(false);
  });

  test("escapes special regex characters", () => {
    const regex = globToRegex("test.file");
    expect(regex.test("test.file")).toBe(true);
    expect(regex.test("testXfile")).toBe(false);
  });

  test("handles prefix wildcard", () => {
    const regex = globToRegex("*-read");
    expect(regex.test("linear-issues-read")).toBe(true);
    expect(regex.test("linear-projects-read")).toBe(true);
    expect(regex.test("read")).toBe(false);
  });
});

describe("matchSkills", () => {
  test("matches exact skill name", () => {
    const result = matchSkills("linear-issues-read", mockSkills, domains);
    expect(result.length).toBe(1);
    expect(result[0]?.name).toBe("linear-issues-read");
  });

  test("returns empty array for non-existent skill", () => {
    const result = matchSkills("non-existent", mockSkills, domains);
    expect(result.length).toBe(0);
  });

  test("matches all skills in a domain", () => {
    const result = matchSkills("linear", mockSkills, domains);
    expect(result.length).toBe(4);
    expect(result.every((s) => s.domain === "linear")).toBe(true);
  });

  test("matches skills with glob pattern linear-*", () => {
    const result = matchSkills("linear-*", mockSkills, domains);
    expect(result.length).toBe(4);
    expect(result.map((s) => s.name)).toContain("linear-issues-read");
    expect(result.map((s) => s.name)).toContain("linear-projects-write");
  });

  test("matches skills with glob pattern *-read", () => {
    const result = matchSkills("*-read", mockSkills, domains);
    expect(result.length).toBe(2);
    expect(result.every((s) => s.name.endsWith("-read"))).toBe(true);
  });

  test("matches skills with glob pattern linear-*-read", () => {
    const result = matchSkills("linear-*-read", mockSkills, domains);
    expect(result.length).toBe(2);
    expect(result.map((s) => s.name)).toContain("linear-issues-read");
    expect(result.map((s) => s.name)).toContain("linear-projects-read");
  });

  test("matches skills with glob pattern *-issues-*", () => {
    const result = matchSkills("*-issues-*", mockSkills, domains);
    expect(result.length).toBe(2);
    expect(result.map((s) => s.name)).toContain("linear-issues-read");
    expect(result.map((s) => s.name)).toContain("linear-issues-write");
  });

  test("domain match takes precedence over glob", () => {
    // If "linear" is a domain, it should match all skills in that domain
    // not just skills whose name is exactly "linear"
    const result = matchSkills("linear", mockSkills, domains);
    expect(result.length).toBe(4);
  });

  test("handles github domain", () => {
    const result = matchSkills("github", mockSkills, domains);
    expect(result.length).toBe(2);
    expect(result.map((s) => s.name)).toContain("github-pr");
    expect(result.map((s) => s.name)).toContain("code-review");
  });

  test("glob pattern github-* only matches github-pr", () => {
    const result = matchSkills("github-*", mockSkills, domains);
    expect(result.length).toBe(1);
    expect(result[0]?.name).toBe("github-pr");
  });
});
