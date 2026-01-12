import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTestDir,
  cleanupTestDir,
  runCli,
} from "./helpers.ts";
import { startMockServer, type MockServer } from "./mock-server.ts";

describe("skz list", () => {
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

  test("lists skills grouped by domain", async () => {
    const result = await runCli(["list"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);

    // Should show domain headers
    expect(result.stdout.toUpperCase()).toContain("TERMINAL");
    expect(result.stdout.toUpperCase()).toContain("LINEAR");
  }, 30000);

  test("lists all skills from mock registry", async () => {
    const result = await runCli(["list"], {
      cwd: testDir,
      env: { SKZ_TEST_REGISTRY: mockServer.url },
    });

    expect(result.exitCode).toBe(0);

    // Should show all test skills
    expect(result.stdout).toContain("tmux");
    expect(result.stdout).toContain("linear-issues-read");
    expect(result.stdout).toContain("linear-issues-write");
  }, 30000);
});
