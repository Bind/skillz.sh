#!/usr/bin/env bun
/**
 * List guideline files (AGENTS.md / CLAUDE.md) relevant to a PR
 *
 * Searches for guideline files in:
 * - Repository root
 * - Directories containing files modified in the PR
 *
 * Prioritizes AGENTS.md over CLAUDE.md if both exist in same directory.
 *
 * Usage:
 *   bun run list-guideline-files.ts [pr-number] [options]
 *
 * Options:
 *   --json      Output as JSON with file contents
 *   --help      Show this help
 */

import {
  checkGhCli,
  getRepoInfo,
  getPrFiles,
  getPrJson,
  getDirectoriesFromFiles,
  getGuidelineFileNames,
  getFileContent,
  resolvePrNumber,
} from "../../utils/github.ts";
import { parseArgs, error } from "../../utils/utils.ts";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
List guideline files (AGENTS.md / CLAUDE.md) relevant to a PR

Searches for guideline files in the repository root and in directories
containing files modified by the PR.

Usage:
  bun run list-guideline-files.ts [pr-number] [options]

Arguments:
  pr-number    PR number (optional, defaults to current branch's PR)

Options:
  --json       Output as JSON with file contents
  --help       Show this help

Output (default):
  List of file paths, one per line

Output (--json):
  Array of objects with path and content fields

Examples:
  bun run list-guideline-files.ts
  bun run list-guideline-files.ts 123
  bun run list-guideline-files.ts 123 --json
`);
  process.exit(0);
}

interface GuidelineFile {
  path: string;
  content: string;
}

interface PrRef {
  headRefName: string;
  headRefOid: string;
}

async function main(): Promise<void> {
  checkGhCli();

  const prNumber = resolvePrNumber(positional[0]);
  const jsonOutput = flags.json === true;

  const { owner, repo } = getRepoInfo();

  // Get PR head ref for fetching file contents
  const prRef = getPrJson<PrRef>(prNumber, ["headRefName", "headRefOid"]);
  const ref = prRef.headRefOid;

  // Get files changed in PR
  const changedFiles = getPrFiles(prNumber);

  // Get directories to search (includes root "")
  const directories = getDirectoriesFromFiles(changedFiles);

  // Guideline file names in priority order
  const guidelineNames = getGuidelineFileNames();

  // Find guideline files
  const foundFiles: GuidelineFile[] = [];
  const foundDirs = new Set<string>();

  for (const dir of directories) {
    // Skip if we already found a guideline file in this directory
    if (foundDirs.has(dir)) continue;

    for (const fileName of guidelineNames) {
      const filePath = dir ? `${dir}/${fileName}` : fileName;
      const content = getFileContent(owner, repo, filePath, ref);

      if (content !== null) {
        foundFiles.push({ path: filePath, content });
        foundDirs.add(dir);
        // Found one in this dir, skip checking other names (priority order)
        break;
      }
    }
  }

  // Sort by path depth (root first, then alphabetically)
  foundFiles.sort((a, b) => {
    const depthA = a.path.split("/").length;
    const depthB = b.path.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.path.localeCompare(b.path);
  });

  if (jsonOutput) {
    console.log(JSON.stringify(foundFiles, null, 2));
  } else {
    if (foundFiles.length === 0) {
      console.log("No guideline files found.");
    } else {
      for (const file of foundFiles) {
        console.log(file.path);
      }
      console.log(`\nFound ${foundFiles.length} guideline file(s)`);
    }
  }
}

main().catch((e) => error(e.message));
