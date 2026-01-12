---
name: context-tree
description: Generate a project tree annotated with context.md notes to help future sessions, (auto-call at session start)
version: 1.0.0
license: MIT
compatibility: opencode
domain: docs
---

## Overview

This skill builds a directory tree for your current project and injects the contents of any `context.md` files it finds. The result is an annotated map of where key features, tests, and workflows live so a new agent session can launch with better orientation. The CLI can be auto-called at the start of a session to keep every visit in sync with the repo layout before other tasks run.

## Usage

1. Install the skill via the OpenCode CLI (e.g., `bunx skz add context-tree`).
2. After installation, run the bundled script directly: `bun .opencode/skill/context-tree/tree.ts [options]` (or load it through `skill({ name: "context-tree" })`).
3. For auto-calls, add the tree command to your session startup plan or initial shell command so agents always begin with a navigational snapshot.

The command walks the working directory (by default the repo root) and prints an ASCII tree with inline `context.md` summaries for directories you want future sessions to remember.

## Auto-call

Add this skill to your startup plan (e.g., call `skill({ name: "context-tree" })` from `.opencode/opencode.json` or `.claude/skills/<agent>/plan.json`) so it runs before agents start executing other work. The skill is read-only and safe to run frequently—its goal is orientation, not modification.

## Directory context

Drop a `context.md` file into any directory you want future sessions to memorize. The skill reads the first paragraph from the file, collapses whitespace, and displays it inline in the tree. Typical context notes include:

- What the folder owns (feature, subsystem, tests, scripts)
- High-level API/entry points
- Testing instructions or cautions
- Quick links to deeper documentation

## Configuration

### Collapse file

The skill loads defaults from `collapse.txt` located next to `tree.ts` (`.opencode/skill/context-tree/collapse.txt` once installed). List one directory per line, accept `#` comments, and keep entries relative to the repo root. The CLI also respects `--collapse` overrides and, when needed, the `--no-collapse-file` flag to ignore this file entirely.

## Options

| Flag                 | Description                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--max-depth <n>`    | Limit how deep the tree goes (default: `3`).                                                                          |
| `--root <path>`      | Run the tree from a different folder (defaults to current directory).                                                 |
| `--ignore <list>`    | Comma-separated directories or files to skip (default: `.git,node_modules,.opencode,registry,docs/dist,docs/public`). |
| `--collapse <list>`  | Comma-separated directories that show only their header (default: none; use `collapse.txt`).                          |
| `--no-collapse-file` | Skip loading the bundled `collapse.txt` when you only want manual overrides.                                          |
| `--no-files`         | Only list directories, hiding individual files.                                                                       |

## Examples

```
bun .opencode/skill/context-tree/tree.ts --max-depth 2
bun .opencode/skill/context-tree/tree.ts --collapse "docs/src" --no-collapse-file
```

bun .opencode/skill/context-tree/tree.ts [options]

```

The command walks the working directory (by default, the current repo root) and prints an ASCII tree. Each folder that contains a `context.md` file has the note injected directly beneath its branch so you can quickly see what lives there without opening every file.

## Directory context

Drop a `context.md` file into any directory you want future sessions to remember. The skill reads the first paragraph from the file, collapses whitespace, and displays it inline in the tree. Typical context notes include:

- What the folder owns (feature, subsystem, tests, scripts)
- High-level API/entry points
- Testing instructions or cautions
- Quick links to deeper documentation

## Options

| Flag | Description |
| ---- | ----------- |
| `--max-depth <n>` | Limit how deep the tree goes (default: `3`). |
| `--root <path>` | Run the tree from a different folder (defaults to current directory). |
| `--ignore <list>` | Comma-separated directories or files to skip (default: `.git,node_modules,.opencode,registry,docs/dist,docs/public`). |
| `--collapse <list>` | Comma-separated directories that show only their header (default: none; use `collapse.txt`). |
| `--no-files` | Only list directories, hiding individual files. |

## Collapse configuration

Drop a `collapse.txt` beside `tree.ts` to list directories that should remain collapsed in the tree output (one entry per line, comments starting with `#` are ignored). The skill ships with `.playwright-data` already collapsed, but you can add more entries or override them via `--collapse`.

## Examples

```

bun .opencode/skill/context-tree/tree.ts --max-depth 2
bun .opencode/skill/context-tree/tree.ts --collapse "docs/src,.playwright-data" --no-files

```

```
