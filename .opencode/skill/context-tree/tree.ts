#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { error, parseArgs } from "../../utils/utils.ts";

const DEFAULT_MAX_DEPTH = 3;
const CONTEXT_SUMMARY_LIMIT = 220;
const DEFAULT_IGNORES = [
  ".git",
  "node_modules",
  ".opencode",
  "registry",
  "public",
  ".astro",
  ".DS_Store",
  "docs/dist",
  "docs/public",
  "docs/.astro",
];
const DEFAULT_COLLAPSED: string[] = [];
const SKILL_DIR = dirname(new URL(".", import.meta.url).pathname);
const COLLAPSE_FILE = join(SKILL_DIR, "collapse.txt");

type Flags = Record<string, string | boolean>;

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const maxDepth = parseMaxDepth(flags);
  const showFiles = flags["no-files"] !== true;
  const rootArg = typeof flags.root === "string" ? flags.root : undefined;
  const rootPath = resolve(rootArg ?? process.cwd());
  const collapseFlag = flags.collapse;
  const skipCollapseFile = flags["no-collapse-file"] === true;

  const rootStats = await stat(rootPath).catch(() => null);
  if (!rootStats) {
    error(`Root path does not exist: ${rootArg ?? rootPath}`);
  }

  if (!rootStats.isDirectory()) {
    error(`Root path is not a directory: ${rootArg ?? rootPath}`);
  }

  const ignoreSet = buildIgnoreSet(flags.ignore);
  const collapseSet = await buildCollapseSet(collapseFlag, skipCollapseFile);
  const lines: string[] = [];

  const fallbackRoot = basename(rootPath) || rootPath;
  const preferredRoot = rootArg ?? fallbackRoot;
  const sanitizedRoot = preferredRoot.replace(/\/$/, "");
  const displayName = sanitizedRoot || rootPath;
  lines.push(`${displayName}/`);

  const initialContext = await readContext(rootPath);
  if (initialContext) {
    lines.push(`context.md: ${initialContext}`);
  }

  await buildTree(rootPath, "", 0, maxDepth, showFiles, lines, ignoreSet, collapseSet, rootPath);

  console.log(lines.join("\n"));
}

function printHelp(): void {
  console.log(`
context-tree - show annotated repository layout by folding in context.md notes

Usage:
  bun .opencode/skill/context-tree/tree.ts [options]

Options:
  --max-depth <n>        Limit how many directory levels are displayed (default: ${DEFAULT_MAX_DEPTH}).
  --root <path>          Use a different starting directory instead of the current working dir.
  --ignore <list>        Skip comma-separated files or paths (default: ${DEFAULT_IGNORES.join(",")}).
  --collapse <list>      Explicitly collapse additional directories.
  --no-collapse-file     Ignore the bundled collapse.txt configuration.
  --no-files             Only show directories, hiding individual files.
  --help                 Show this help text.
`);
}



function parseMaxDepth(flags: Flags): number {
  const maxDepthFlag = typeof flags["max-depth"] === "string" ? flags["max-depth"] : undefined;
  if (typeof maxDepthFlag === "string") {
    const parsed = Number.parseInt(maxDepthFlag, 10);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      error("--max-depth must be a non-negative integer");
    }
    return parsed;
  }
  return DEFAULT_MAX_DEPTH;
}

function buildIgnoreSet(ignoreFlag: string | boolean | undefined): Set<string> {
  const extraIgnores: string[] = [];
  if (typeof ignoreFlag === "string" && ignoreFlag.trim().length > 0) {
    extraIgnores.push(...ignoreFlag.split(",").map((part) => part.trim()).filter(Boolean));
  }

  const set = new Set<string>([...DEFAULT_IGNORES, ...extraIgnores].map(normalizePath));
  return set;
}

async function buildCollapseSet(
  collapseFlag: string | boolean | undefined,
  skipCollapseFile: boolean
): Promise<Set<string>> {
  const entries = new Set<string>(DEFAULT_COLLAPSED.map(normalizePath));
  if (!skipCollapseFile) {
    const fileEntries = await readCollapseFile();
    for (const entry of fileEntries) {
      entries.add(normalizePath(entry));
    }
  }

  if (typeof collapseFlag === "string" && collapseFlag.trim().length > 0) {
    collapseFlag
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((entry) => entries.add(normalizePath(entry)));
  }

  return entries;
}

async function readCollapseFile(): Promise<string[]> {
  try {
    const file = Bun.file(COLLAPSE_FILE);
    if (!(await file.exists())) {
      return [];
    }

    const text = await file.text();
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return [];
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/$/, "");
}

async function buildTree(
  currentDir: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  showFiles: boolean,
  lines: string[],
  ignoreSet: Set<string>,
  collapseSet: Set<string>,
  rootPath: string
): Promise<void> {
  if (depth >= maxDepth) {
    return;
  }

  const entries = await readEntries(currentDir);
  const visibleEntries = entries
    .filter((entry) => shouldInclude(entry, currentDir, ignoreSet, rootPath, showFiles))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) {
        return -1;
      }
      if (!a.isDirectory() && b.isDirectory()) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

  const total = visibleEntries.length;
  for (let index = 0; index < total; index++) {
    const entry = visibleEntries[index];
    const isLast = index === total - 1;
    const connector = isLast ? "└──" : "├──";
    const entryPath = entry.isDirectory() ? join(currentDir, entry.name) : currentDir;
    const normalizedName = normalizePath(entry.name);
    const relativePath = entry.isDirectory() ? normalizePath(relative(rootPath, entryPath)) : normalizedName;
    const isCollapsed = entry.isDirectory() && shouldCollapse(relativePath || normalizedName, normalizedName, collapseSet);
    const entrySuffix = entry.isDirectory() && isCollapsed ? " (collapsed)" : "";
    const entryLabel = entry.isDirectory() ? `${entry.name}/${entrySuffix}` : entry.name;
    lines.push(`${prefix}${connector} ${entryLabel}`);

    const nextPrefix = `${prefix}${isLast ? "    " : "│   "}`;

    if (entry.isDirectory()) {
      const context = await readContext(entryPath);
      if (context) {
        lines.push(`${nextPrefix}context.md: ${context}`);
      }
      if (!isCollapsed) {
        await buildTree(entryPath, nextPrefix, depth + 1, maxDepth, showFiles, lines, ignoreSet, collapseSet, rootPath);
      }
    }
  }
}

async function readEntries(dir: string): Promise<import("node:fs").Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : String(error_);
    console.error(`Failed to read ${dir}: ${message}`);
    return [];
  }
}

function shouldInclude(
  entry: import("node:fs").Dirent,
  currentDir: string,
  ignoreSet: Set<string>,
  rootPath: string,
  showFiles: boolean
): boolean {
  if (!showFiles && !entry.isDirectory()) {
    return false;
  }

  const entryPath = join(currentDir, entry.name);
  const normalizedName = normalizePath(entry.name);
  const relativePath = normalizePath(relative(rootPath, entryPath));

  if (ignoreSet.has(normalizedName) || (relativePath && ignoreSet.has(relativePath))) {
    return false;
  }

  return true;
}

function shouldCollapse(entryRelative: string, entryName: string, collapseSet: Set<string>): boolean {
  if (collapseSet.has(entryRelative)) {
    return true;
  }
  if (entryName && collapseSet.has(entryName)) {
    return true;
  }
  return false;
}

async function readContext(dir: string): Promise<string | null> {
  try {
    const contextPath = join(dir, "context.md");
    const file = Bun.file(contextPath);
    if (!(await file.exists())) {
      return null;
    }
    const text = await file.text();
    return summarizeContext(text);
  } catch (error_) {
    return null;
  }
}

function summarizeContext(raw: string): string | null {
  const cleaned = raw.replace(/\r/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const lines = cleaned.split("\n");
  const excerpt: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      break;
    }
    excerpt.push(trimmed);
    if (excerpt.join(" ").length > CONTEXT_SUMMARY_LIMIT) {
      break;
    }
  }

  if (excerpt.length === 0) {
    return null;
  }

  let summary = excerpt.join(" ").replace(/\s+/g, " ");
  if (summary.length > CONTEXT_SUMMARY_LIMIT) {
    summary = summary.slice(0, CONTEXT_SUMMARY_LIMIT).trim() + "…";
  }

  return summary;
}

main().catch((error_) => {
  const message = error_ instanceof Error ? error_.message : String(error_);
  console.error(message);
  process.exit(1);
});
