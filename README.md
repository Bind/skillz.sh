# skillz.sh

Hackable AI agent skills for [OpenCode](https://opencode.ai) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Inspired by [shadcn/ui](https://ui.shadcn.com).

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

The CLI auto-detects your environment:

- **Claude Code** (`.claude/` exists) → installs to `.claude/skills/`
- **OpenCode** → installs to `.opencode/skill/`

## Usage

```bash
# List available skills (grouped by domain)
skz list

# Add all skills in a domain
skz add linear

# Add a specific skill
skz add linear-issues-read

# Interactive picker (select domain, then skills)
skz add
```

### Adding a Domain

The easiest way to get started is to add an entire domain:

```bash
skz add linear
```

This will:
1. Install all Linear skills (issues, projects, milestones - read & write)
2. Configure permissions automatically:
   - Read skills → `allow` (no prompting)
   - Write skills → `ask` (prompts before execution)
3. Add required dependencies to `package.json`
4. Show setup instructions (e.g., required environment variables)

## Available Skills

### Linear

CLI tools for managing Linear issues, projects, and milestones.

| Skill                     | Description                                |
| ------------------------- | ------------------------------------------ |
| `linear-issues-read`      | List and get Linear issues (read-only)     |
| `linear-issues-write`     | Create and update Linear issues            |
| `linear-projects-read`    | List and get Linear projects (read-only)   |
| `linear-projects-write`   | Create and update Linear projects          |
| `linear-milestones-read`  | List Linear project milestones (read-only) |
| `linear-milestones-write` | Create and update Linear milestones        |

**Setup:** Add `LINEAR_API_KEY` to your `.env` file. Get your key from Linear Settings > API > Personal API keys.

### Browser

| Skill               | Description                                      |
| ------------------- | ------------------------------------------------ |
| `playwright-browser` | Control a browser - navigate, interact, screenshot |

### Database

| Skill  | Description                              |
| ------ | ---------------------------------------- |
| `psql` | Run PostgreSQL queries and meta-commands |

### Terminal

| Skill  | Description                                  |
| ------ | -------------------------------------------- |
| `tmux` | Manage tmux sessions for background processes |

## Project Structure

### Claude Code

```
your-project/
├── .claude/
│   ├── skills/
│   │   └── linear-issues-read/
│   │       ├── SKILL.md        # Agent instructions
│   │       ├── list-issues.ts  # Your code now
│   │       └── get-issue.ts
│   ├── settings.json           # Permissions (auto-configured)
│   └── skz.json                # Registry config
└── package.json
```

### OpenCode

```
your-project/
├── .opencode/
│   ├── skill/
│   │   └── linear-issues-read/
│   │       ├── SKILL.md
│   │       ├── list-issues.ts
│   │       └── get-issue.ts
│   ├── utils/
│   │   ├── utils.ts            # Shared helpers
│   │   └── linear.ts           # Linear SDK wrapper
│   └── skz.json
└── package.json
```

## Permission Configuration

### Claude Code

Permissions are automatically configured in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(bun .claude/skills/linear-issues-read/*.ts:*)",
      "Bash(bun .claude/skills/linear-projects-read/*.ts:*)"
    ],
    "ask": [
      "Bash(bun .claude/skills/linear-issues-write/*.ts:*)"
    ]
  }
}
```

### OpenCode

Configure in `opencode.json`:

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

`skz` copies skill source code directly into your project. You can:

- **Read** the skill code to understand what it does
- **Modify** it to fit your specific workflow
- **Delete** parts you don't need
- **Extend** it with custom functionality

## Creating Skills

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details on creating and publishing skills.

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
