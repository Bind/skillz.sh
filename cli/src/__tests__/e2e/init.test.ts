import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import {
  createTestDir,
  cleanupTestDir,
  runCli,
  fileExists,
  readJson,
  mkdir,
} from "./helpers.ts";
import { startMockServer, type MockServer } from "./mock-server.ts";

describe("skz init", () => {
  let testDir: string;
  let mockServer: MockServer;

  beforeEach(async () => {
    testDir = await createTestDir();
    mockServer = startMockServer();
  });

  afterEach(async () => {
    mockServer.stop();
    await cleanupTestDir(testDir);
  });

  test("creates OpenCode structure", async () => {
    const result = await runCli(["init"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Created .opencode/skz.json");

    // Verify files created
    expect(await fileExists(join(testDir, ".opencode/skz.json"))).toBe(true);
    expect(await fileExists(join(testDir, ".opencode/skill"))).toBe(true);
    expect(await fileExists(join(testDir, ".opencode/utils/utils.ts"))).toBe(true);

    // Verify config content
    const config = await readJson<{ registries: string[] }>(
      join(testDir, ".opencode/skz.json")
    );
    expect(config.registries).toBeArray();
    expect(config.registries.length).toBeGreaterThan(0);
  }, 30000);

  test("creates Claude structure with --claude flag", async () => {
    const result = await runCli(["init", "--claude"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".claude");

    // Verify Claude files created
    expect(await fileExists(join(testDir, ".claude/skills"))).toBe(true);
    expect(await fileExists(join(testDir, ".claude/skz.json"))).toBe(true);
  }, 30000);

  test("auto-detects OpenCode when .opencode/ exists", async () => {
    // Pre-create .opencode directory
    await mkdir(join(testDir, ".opencode"));

    const result = await runCli(["init"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(join(testDir, ".opencode/skz.json"))).toBe(true);
    // Should NOT create .claude
    expect(await fileExists(join(testDir, ".claude/skz.json"))).toBe(false);
  }, 30000);

  test("auto-detects Claude when .claude/ exists", async () => {
    // Pre-create .claude directory
    await mkdir(join(testDir, ".claude"));

    const result = await runCli(["init"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(join(testDir, ".claude/skz.json"))).toBe(true);
    expect(await fileExists(join(testDir, ".claude/skills"))).toBe(true);
  }, 30000);
});
