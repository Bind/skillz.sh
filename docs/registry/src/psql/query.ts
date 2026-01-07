#!/usr/bin/env bun
/**
 * Run a SQL query or psql meta-command against PostgreSQL
 *
 * Usage:
 *   bun run query.ts <query> [options]
 *   bun run query.ts --file <path> [options]
 *
 * Options:
 *   --file <path>      Execute SQL file instead of inline query
 *   --tuples           Tuples only output (no headers/row count)
 *   --timeout <ms>     Query timeout in milliseconds (default: 30000)
 *   --json             Wrap output in JSON
 *   --help             Show this help
 *
 * Environment variables (from .env or exported):
 *   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, PGSSLMODE
 */

import { parseArgs, error } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Run a SQL query or psql meta-command against PostgreSQL

Usage:
  bun run query.ts <query> [options]
  bun run query.ts --file <path> [options]

Arguments:
  query              SQL query or meta-command (e.g., "\\dt")

Options:
  --file <path>      Execute SQL file instead of inline query
  --tuples           Tuples only output (no headers/row count)
  --timeout <ms>     Query timeout in milliseconds (default: 30000)
  --json             Wrap output in JSON
  --help             Show this help

Environment variables (from .env or exported):
  PGHOST        Database host (required)
  PGPORT        Database port (default: 5432)
  PGDATABASE    Database name (required)
  PGUSER        Database user (required)
  PGPASSWORD    Database password (required)
  PGSSLMODE     SSL mode (optional)

Examples:
  bun run query.ts "SELECT * FROM users LIMIT 5;"
  bun run query.ts "\\dt"
  bun run query.ts "\\d users"
  bun run query.ts --file migrations/001.sql
  bun run query.ts "SELECT id FROM users;" --tuples
`);
  process.exit(0);
}

const query = positional[0];
const file = typeof flags.file === "string" ? flags.file : undefined;
const tuples = flags.tuples === true;
const jsonOutput = flags.json === true;
const timeout = typeof flags.timeout === "string" ? parseInt(flags.timeout, 10) : 30000;

// Validate input
if (!query && !file) {
  error("Query or --file is required. Usage: query.ts <query> or query.ts --file <path>");
}

if (query && file) {
  error("Cannot specify both inline query and --file");
}

// Validate required environment variables
const pgHost = process.env.PGHOST;
const pgPort = process.env.PGPORT ?? "5432";
const pgDatabase = process.env.PGDATABASE;
const pgUser = process.env.PGUSER;
const pgPassword = process.env.PGPASSWORD;
const pgSslMode = process.env.PGSSLMODE;

const missing: string[] = [];
if (!pgHost) missing.push("PGHOST");
if (!pgDatabase) missing.push("PGDATABASE");
if (!pgUser) missing.push("PGUSER");
if (!pgPassword) missing.push("PGPASSWORD");

if (missing.length > 0) {
  error(`Missing required environment variables: ${missing.join(", ")}\nSet them in .env or export them.`);
}

async function main() {
  // Build psql args
  const args = [
    "-h", pgHost!,
    "-p", pgPort,
    "-U", pgUser!,
    "-d", pgDatabase!,
    "-X", // Skip .psqlrc
  ];

  if (tuples) {
    args.push("-t"); // Tuples only
    args.push("-A"); // Unaligned output
  }

  if (file) {
    args.push("-f", file);
  } else {
    args.push("-c", query!);
  }

  // Build environment
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PGPASSWORD: pgPassword!,
  };

  if (pgSslMode) {
    env.PGSSLMODE = pgSslMode;
  }

  // Execute psql
  const proc = Bun.spawn(["psql", ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Set up timeout
  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  // Wait for completion
  const exitCode = await proc.exited;
  clearTimeout(timeoutId);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  // Handle errors
  if (exitCode !== 0) {
    const errorMsg = stderr.trim() || stdout.trim() || `psql exited with code ${exitCode}`;
    error(errorMsg);
  }

  // Output result
  const output = stdout.trimEnd();

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          query: query ?? `file:${file}`,
          output,
        },
        null,
        2
      )
    );
  } else {
    console.log(output);
  }
}

main().catch((e) => error(e.message));
