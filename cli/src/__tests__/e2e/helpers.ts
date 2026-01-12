import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to CLI entry point */
export const CLI_PATH = join(__dirname, "../../cli.ts");

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Create an isolated temp directory for testing.
 */
export async function createTestDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "skz-e2e-"));
}

/**
 * Clean up a test directory.
 */
export async function cleanupTestDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Run the CLI with specified arguments.
 */
export async function runCli(
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
  }
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", CLI_PATH, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

/**
 * Check if a file or directory exists.
 */
export async function fileExists(path: string): Promise<boolean> {
  const { stat } = await import("node:fs/promises");
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read file contents as text.
 */
export async function readFile(path: string): Promise<string> {
  return Bun.file(path).text();
}

/**
 * Read and parse a JSON file.
 */
export async function readJson<T>(path: string): Promise<T> {
  return Bun.file(path).json() as Promise<T>;
}

/**
 * Write content to a file.
 */
export async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

/**
 * Create a directory (and parents).
 */
export async function mkdir(path: string): Promise<void> {
  const { mkdir: fsMkdir } = await import("node:fs/promises");
  await fsMkdir(path, { recursive: true });
}
