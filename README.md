# skillz.sh

Hackable AI agent skills for [OpenCode](https://opencode.ai). Inspired by [shadcn/ui](https://ui.shadcn.com).

**Not a package. Not a dependency.** Skills are copied directly into your project where you own the code and can modify it to fit your needs.

## Why?

- **Full ownership** - Skills live in your repo
- **Hackable** - Modify any skill to fit your workflow
- **No lock-in** - Fork, customize, or vendor skills permanently
- **Transparent** - Read exactly what your AI agent will do

## Installation

```bash
# Using bunx (recommended)
bunx @bind/skillz init

# Or install globally
bun install -g @bind/skillz
skz init
```

This creates:

- `skz.json` - Registry configuration
- `.opencode/skill/` - Where skills are installed
- `utils/` - Shared utilities

## Usage

```bash
# List available skills
skz list

# Add a skill (copies to your project)
skz add linear-issues-read

# Add multiple skills
skz add linear-issues-read linear-projects-read

# Interactive picker
skz add
```

Skills are installed to `.opencode/skill/<name>/` where [OpenCode automatically discovers them](https://opencode.ai/docs/skills/).

## Available Skills

### Linear Integration

CLI tools for managing Linear issues, projects, and milestones. Split into read/write skills for granular permission control.

| Skill                     | Description                                |
| ------------------------- | ------------------------------------------ |
| `linear-issues-read`      | List and get Linear issues (read-only)     |
| `linear-issues-write`     | Create and update Linear issues            |
| `linear-projects-read`    | List and get Linear projects (read-only)   |
| `linear-projects-write`   | Create and update Linear projects          |
| `linear-milestones-read`  | List Linear project milestones (read-only) |
| `linear-milestones-write` | Create and update Linear milestones        |

### Setup

1. Add `LINEAR_API_KEY=lin_api_...` to your project's `.env` file
2. Run `skz add linear-issues-read` (or any Linear skill)

### Permission Configuration

Control which skills your AI agent can use in `opencode.json`:

```json
{
  "permission": {
    "skill": {
      "linear-*-read": "allow",
      "linear-*-write": "ask"
    }
  }
}
```

## How It Works

`skz` copies skill source code directly into your project:

```
your-project/
├── .opencode/
│   └── skill/
│       └── linear-issues-read/
│           ├── SKILL.md        # Agent instructions
│           ├── list-issues.ts  # Your code now
│           └── get-issue.ts
├── utils/
│   ├── utils.ts               # Shared helpers
│   └── linear.ts              # Linear SDK wrapper
└── skz.json                   # Registry config
```

You can:

- **Read** the skill code to understand what it does
- **Modify** it to fit your specific workflow
- **Delete** parts you don't need
- **Extend** it with custom functionality

## Creating Skills

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details on creating and publishing skills.

Skills follow the [OpenCode Agent Skills](https://opencode.ai/docs/skills/) specification.

## Contributing

```bash
git clone https://github.com/Bind/skillz.sh.git
cd skillz.sh
bun install
git config core.hooksPath .githooks
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## License

MIT
