import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import {
  createTestDir,
  cleanupTestDir,
  runCli,
  fileExists,
  readJson,
  mkdir,
  writeFile,
} from "./helpers.ts";
import { startMockServer, type MockServer } from "./mock-server.ts";

describe("skz add (OpenCode)", () => {
  let testDir: string;
  let mockServer: MockServer;

  beforeEach(async () => {
    testDir = await createTestDir();
    mockServer = startMockServer();

    // Initialize the project first
    await runCli(["init"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });
  });

  afterEach(async () => {
    mockServer.stop();
    await cleanupTestDir(testDir);
  });

  test("adds single skill by exact name", async () => {
    const result = await runCli(["add", "tmux", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Installing tmux");
    expect(result.stdout).toContain("Installed tmux");

    // Verify skill files
    expect(await fileExists(join(testDir, ".opencode/skill/tmux/SKILL.md"))).toBe(true);
    expect(await fileExists(join(testDir, ".opencode/skill/tmux/skill.json"))).toBe(true);
  }, 30000);

  test("adds all skills in a domain", async () => {
    const result = await runCli(["add", "linear", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("linear-issues-read");
    expect(result.stdout).toContain("linear-issues-write");

    // Both skills should be installed
    expect(await fileExists(join(testDir, ".opencode/skill/linear-issues-read/SKILL.md"))).toBe(true);
    expect(await fileExists(join(testDir, ".opencode/skill/linear-issues-write/SKILL.md"))).toBe(true);
  }, 30000);

  test("adds skills matching glob pattern", async () => {
    const result = await runCli(["add", "linear-*-read", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("linear-issues-read");

    // Only read skill should be installed
    expect(await fileExists(join(testDir, ".opencode/skill/linear-issues-read/SKILL.md"))).toBe(true);
    expect(await fileExists(join(testDir, ".opencode/skill/linear-issues-write/SKILL.md"))).toBe(false);
  }, 30000);

  test("installs utils when required by skill", async () => {
    const result = await runCli(["add", "linear-issues-read", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);

    // Linear util should be installed
    expect(await fileExists(join(testDir, ".opencode/utils/linear.ts"))).toBe(true);
  }, 30000);

  test("updates package.json with dependencies", async () => {
    const result = await runCli(["add", "linear-issues-read", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("@linear/sdk");

    // Check package.json - dependencies could be in dependencies or devDependencies
    const pkg = await readJson<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(join(testDir, "package.json"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(allDeps["@linear/sdk"]).toBeDefined();
  }, 30000);

  test("--yes flag skips overwrite prompts", async () => {
    // Install once
    await runCli(["add", "tmux", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    // Install again with -y should not hang
    const result = await runCli(["add", "tmux", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    // Should complete without hanging (test timeout would fail otherwise)
  }, 30000);
});

describe("skz add (Claude)", () => {
  let testDir: string;
  let mockServer: MockServer;

  beforeEach(async () => {
    testDir = await createTestDir();
    mockServer = startMockServer();

    // Initialize in Claude mode
    await runCli(["init", "--claude"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });
  });

  afterEach(async () => {
    mockServer.stop();
    await cleanupTestDir(testDir);
  });

  test("adds single skill to .claude/skills/", async () => {
    const result = await runCli(["add", "tmux", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Installing tmux to .claude/skills/");

    // Verify skill installed to Claude location
    expect(await fileExists(join(testDir, ".claude/skills/tmux/SKILL.md"))).toBe(true);
  }, 30000);

  test("adds all skills in a domain", async () => {
    const result = await runCli(["add", "linear", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);

    // Both skills should be installed
    expect(await fileExists(join(testDir, ".claude/skills/linear-issues-read/SKILL.md"))).toBe(true);
    expect(await fileExists(join(testDir, ".claude/skills/linear-issues-write/SKILL.md"))).toBe(true);
  }, 30000);

  test("updates .claude/settings.json with permissions", async () => {
    const result = await runCli(["add", "linear", "-y"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Permissions configured");

    // Check settings.json
    const settings = await readJson<{
      permissions?: { allow?: string[]; ask?: string[] };
    }>(join(testDir, ".claude/settings.json"));

    expect(settings.permissions).toBeDefined();
    // Read skills should be in allow (format: "Bash(bun .claude/skills/<name>/*.ts:*)")
    const allowedPaths = settings.permissions!.allow ?? [];
    const askPaths = settings.permissions!.ask ?? [];
    
    expect(allowedPaths.some((p) => p.includes("linear-issues-read"))).toBe(true);
    // Write skills should be in ask
    expect(askPaths.some((p) => p.includes("linear-issues-write"))).toBe(true);
  }, 30000);
});
