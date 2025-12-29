# AGENTS.md

Guidelines for AI agents working in this repository.

## Project Overview

This is **skillz.sh**, a distribution system for OpenCode agent skills. It consists of:

- **Skills** (`skills/`): AI agent skill definitions with SKILL.md instructions
- **CLI** (`cli/`): The `skz` command-line tool for installing skills
- **Source** (`src/`): TypeScript source files referenced by skills
- **Utils** (`utils/`): Shared utilities copied to user projects

## Build Commands

### Root Project

```bash
# Generate registry.json from skills/
bun run build

# Same, but clean first
bun run build:clean
```

### CLI (`cli/`)

```bash
cd cli

# Type check
bun run typecheck

# Run CLI locally
bun run dev init
bun run dev list
bun run dev add <skill-name>

# Or directly
bun run src/cli.ts <command>
```

### No Test Suite

This project does not have automated tests. Verify changes by:
1. Running `bun run build` (root)
2. Running `bun run typecheck` (cli/)
3. Testing CLI commands in a temp directory

## Code Style Guidelines

### TypeScript Configuration

The project uses strict TypeScript with these key settings:
- `strict: true`
- `noUncheckedIndexedAccess: true` - Array/object access may be undefined
- `verbatimModuleSyntax: true` - Use `import type` for type-only imports
- `allowImportingTsExtensions: true` - Include `.ts` extensions in imports

### Imports

```typescript
// Always include .ts extension
import { foo } from "./lib/foo.ts";

// Use import type for type-only imports
import type { SomeType } from "./types.ts";

// Node built-ins use node: prefix
import { readdir } from "node:fs/promises";
import { join } from "node:path";
```

### Formatting

- **Indentation**: 2 spaces
- **Quotes**: Double quotes for strings
- **Semicolons**: Required
- **Trailing commas**: Yes, in multiline structures
- **Line length**: ~80-100 chars preferred

### Naming Conventions

- **Files**: kebab-case (`list-issues.ts`, `create-project.ts`)
- **Variables/functions**: camelCase (`skillName`, `parseArgs`)
- **Types/interfaces**: PascalCase (`SkillMeta`, `FileInfo`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_BRANCH`, `SKILLS_DIR`)

### Type Annotations

```typescript
// Explicit return types on exported functions
export function parseArgs(args: string[]): { flags: Record<string, string> } {}

// Use Record for object types
const flags: Record<string, string | boolean> = {};

// Non-null assertion when certain (use sparingly)
const match = registry.match(/pattern/)!;
return { owner: match[1]!, repo: match[2]! };
```

### Error Handling

```typescript
// Try/catch with typed error message
try {
  const result = await someOperation();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to do thing: ${message}`);
}

// Error helper that exits
export function error(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// Return null for optional operations
async function fetchOptional(): Promise<T | null> {
  try { return await fetchJson<T>(url); } catch { return null; }
}
```

### Async/Await

```typescript
// Always use async/await, not .then()
// Top-level execution pattern
main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
```

### Bun APIs

```typescript
const file = Bun.file(path);
if (await file.exists()) {
  const content = await file.text();
  const json = await file.json();
}
await Bun.write(path, content);
```

## Project-Specific Patterns

### Registry Format

Skills are listed in `registry.json` (auto-generated):

```json
{
  "name": "skillz.sh",
  "skills": [
    { "name": "skill-name", "description": "...", "version": "1.0.0" }
  ]
}
```

### Skill Structure

```
skills/my-skill/
├── SKILL.md       # Required: frontmatter + instructions
└── skill.json     # Optional: entry points, utils, deps
```

### Import Transformation

Source files import from `../../utils/`. The CLI transforms these to `../../../utils/` when installing to `.opencode/skill/<name>/`.

## Pre-commit Hook

The `.githooks/pre-commit` hook runs `bun run build.ts` and stages `registry.json`. Enable with:

```bash
git config core.hooksPath .githooks
```

## Common Tasks

### Adding a New Skill

1. Create `skills/<name>/SKILL.md` with frontmatter
2. Optionally create `skills/<name>/skill.json`
3. Create source files in `src/<name>/`
4. Run `bun run build` to update registry

### Modifying the CLI

1. Edit files in `cli/src/`
2. Run `bun run typecheck` in `cli/`
3. Test with `bun run cli/src/cli.ts <command>`
