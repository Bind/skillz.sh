#!/usr/bin/env bun

/**
 * Publish script - copies registry files to docs/ for GitHub Pages
 *
 * This copies:
 * - registry.json
 * - skills/
 * - src/
 * - utils/
 * - agents/
 *
 * Static files in docs/ (.nojekyll, CNAME, index.html) are preserved.
 */

import { readdir, rm, cp } from "node:fs/promises";
import { join } from "node:path";

const DOCS_DIR = "docs";

// Directories to copy to docs/
const COPY_DIRS = ["skills", "src", "utils", "agents"];

// Files to copy to docs/
const COPY_FILES = ["registry.json"];

// Files in docs/ to preserve (not delete during clean)
const PRESERVE_FILES = [".nojekyll", "CNAME", "index.html"];

async function clean(): Promise<void> {
  console.log("Cleaning docs/ directory...");

  const entries = await readdir(DOCS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (PRESERVE_FILES.includes(entry.name)) {
      continue;
    }

    const fullPath = join(DOCS_DIR, entry.name);
    await rm(fullPath, { recursive: true, force: true });
    console.log(`  Removed ${entry.name}`);
  }
}

async function copyFiles(): Promise<void> {
  console.log("\nCopying files to docs/...");

  // Copy individual files
  for (const file of COPY_FILES) {
    const src = file;
    const dest = join(DOCS_DIR, file);
    await cp(src, dest);
    console.log(`  ${file}`);
  }

  // Copy directories
  for (const dir of COPY_DIRS) {
    const src = dir;
    const dest = join(DOCS_DIR, dir);

    // Check if source exists
    try {
      await readdir(src);
    } catch {
      console.log(`  Skipping ${dir}/ (not found)`);
      continue;
    }

    await cp(src, dest, { recursive: true });
    console.log(`  ${dir}/`);
  }
}

async function main(): Promise<void> {
  console.log("Publishing to docs/\n");

  await clean();
  await copyFiles();

  console.log("\nDone! Files published to docs/");
  console.log("\nNext steps:");
  console.log("  1. Commit and push changes");
  console.log("  2. Configure GitHub Pages to serve from /docs on main branch");
  console.log("  3. Configure DNS for skillz.sh");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
