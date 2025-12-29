# Contributing to skillz.sh

## Setup

1. Clone the repository:

```bash
git clone https://github.com/Bind/skillz.sh.git
cd skillz.sh
```

2. Install dependencies:

```bash
bun install
```

3. Configure git hooks (auto-generates `registry.json` on commit):

```bash
git config core.hooksPath .githooks
```

## Project Structure

```
skillz.sh/
├── skills/                # Skill definitions
│   └── my-skill/
│       ├── SKILL.md       # Instructions for the AI agent (required)
│       └── skill.json     # Entry points, utils, dependencies
├── src/                   # TypeScript source code
│   └── linear/            # Linear integration source files
├── utils/                 # Shared utilities
├── cli/                   # CLI source (published as @bind/skillz)
├── build.ts               # Generates registry.json
└── registry.json          # Auto-generated skill manifest
```

## Creating a New Skill

Skills follow the [OpenCode Agent Skills](https://opencode.ai/docs/skills/) specification. When installed via `skz add`, skills are placed in `.opencode/skill/<name>/` where OpenCode automatically discovers them.

### 1. Create the skill directory

```bash
mkdir -p skills/my-skill
```

### 2. Create SKILL.md

The `SKILL.md` file contains instructions for the AI agent. It must have YAML frontmatter with required fields per the [OpenCode spec](https://opencode.ai/docs/skills/#write-frontmatter):

```markdown
---
name: my-skill
description: What this skill does (1-1024 characters)
version: 1.0.0
license: MIT
compatibility: opencode
---

# My Skill

Instructions for the AI agent on how to use this skill.

## Commands

- `bun .opencode/skill/my-skill/my-command.ts` - Description of command
```

#### Frontmatter Requirements

Per the [OpenCode specification](https://opencode.ai/docs/skills/):

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Must match directory name, lowercase alphanumeric with hyphens, 1-64 chars |
| `description` | Yes | 1-1024 characters, specific enough for the agent to choose correctly |
| `version` | Yes | Semver version (skillz.sh addition for registry) |
| `license` | No | License identifier (e.g., MIT) |
| `compatibility` | No | Target runtime (e.g., opencode) |
| `metadata` | No | String-to-string map for custom metadata |

#### Name Validation

The `name` field must:
- Be 1-64 characters
- Be lowercase alphanumeric with single hyphen separators
- Not start or end with `-`
- Not contain consecutive `--`
- Match the directory name containing `SKILL.md`

Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`

### 3. Create skill.json (optional)

If your skill includes TypeScript tools:

```json
{
  "entry": {
    "my-command": "src/my-skill/my-command.ts"
  },
  "utils": ["utils"],
  "dependencies": {
    "some-package": "^1.0.0"
  }
}
```

| Field | Description |
|-------|-------------|
| `entry` | Maps output filenames to source file paths |
| `utils` | List of util files to install (without `.ts` extension) |
| `dependencies` | NPM packages to add to user's `package.json` |

### 4. Create source files

```bash
mkdir -p src/my-skill
```

Source files should import utils using relative paths from their location:

```typescript
// src/my-skill/my-command.ts
import { someHelper } from "../../utils/utils.ts";

// Your code here
```

The CLI transforms imports to `../../../utils/` when installing to `.opencode/skill/my-skill/`.

### 5. Build and test

```bash
bun run build.ts
```

This regenerates `registry.json` with your new skill.

## OpenCode Integration

### Skill Discovery

OpenCode automatically discovers skills in these locations (see [discovery docs](https://opencode.ai/docs/skills/#understand-discovery)):

- `.opencode/skill/<name>/SKILL.md` (project-local, where `skz` installs)
- `~/.config/opencode/skill/<name>/SKILL.md` (global)
- `.claude/skills/<name>/SKILL.md` (Claude-compatible)

### Permissions

Users can configure skill permissions in their `opencode.json` (see [permissions docs](https://opencode.ai/docs/skills/#configure-permissions)):

```json
{
  "permission": {
    "skill": {
      "linear-*-read": "allow",
      "linear-*-write": "ask",
      "*": "allow"
    }
  }
}
```

| Permission | Behavior |
|------------|----------|
| `allow` | Skill loads immediately |
| `deny` | Skill hidden from agent |
| `ask` | User prompted before loading |

## CLI Development

The CLI lives in `cli/` and is published as `@bind/skillz`.

### Running locally

```bash
# From the cli/ directory
bun run dev init
bun run dev list
bun run dev add my-skill
```

### Type checking

```bash
cd cli
bun run typecheck
```

## Commit Workflow

The pre-commit hook automatically:

1. Runs `bun run build.ts`
2. Stages the updated `registry.json`

This ensures `registry.json` is always in sync with `skills/`.

## Testing Skills Locally

To test a skill before publishing:

1. In a test project, run `skz init`
2. Edit `skz.json` to point to your local fork or branch
3. Run `skz add my-skill`

## Pull Request Guidelines

- One skill per PR (unless they're related)
- Include a description of what the skill does
- Ensure `name` follows the [validation rules](https://opencode.ai/docs/skills/#validate-names)
- Ensure `description` is specific enough for agents to choose correctly
- Test the skill locally before submitting
- Ensure `bun run build.ts` succeeds
- Run `bun run typecheck` in `cli/` if you modified CLI code

## Resources

- [OpenCode Agent Skills Documentation](https://opencode.ai/docs/skills/)
- [OpenCode Permissions](https://opencode.ai/docs/permissions/)
- [OpenCode Custom Tools](https://opencode.ai/docs/custom-tools/)
