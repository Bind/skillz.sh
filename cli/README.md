# skz

CLI for distributing OpenCode skills. Similar to shadcn, but for AI agent skills.

## Installation

```bash
bun install -g github:Bind/skillz.sh/cli
```

## Usage

### Initialize in a project

```bash
skz init
```

This creates:
- `skz.json` - Configuration file with registry settings
- `.opencode/skill/` - Directory for installed skills

### List available skills

```bash
skz list
```

Shows all skills available from configured registries with name, version, and description.

### Add skills

```bash
# Add a specific skill
skz add code-review

# Add multiple skills
skz add code-review git-release

# Interactive picker
skz add
```

## Configuration

### skz.json

```json
{
  "$schema": "https://skillz.sh/schema.json",
  "registries": [
    "github:Bind/skillz.sh"
  ]
}
```

## Registry Format

Registries are GitHub repositories with this structure:

```
your-registry/
├── registry.json
└── skills/
    └── skill-name/
        └── SKILL.md
```

### registry.json

```json
{
  "name": "my-registry",
  "skills": [
    {
      "name": "code-review",
      "description": "Perform thorough code reviews",
      "version": "1.0.0"
    }
  ]
}
```

### SKILL.md

Skills follow the [OpenCode skill format](https://opencode.ai/docs/skills/):

```markdown
---
name: code-review
description: Perform thorough code reviews
version: 1.0.0
license: MIT
---

## Instructions

Your skill instructions here...
```

## Development

```bash
# Install dependencies
bun install

# Run locally
bun run src/cli.ts init
bun run src/cli.ts list
bun run src/cli.ts add

# Type check
bun run typecheck
```
