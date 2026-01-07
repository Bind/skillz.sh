# compound-docs Skill Implementation

## Status: Complete

## Philosophy & Attribution

> Each documented solution compounds your team's knowledge. The first time 
> you solve a problem takes research. Document it, and the next occurrence 
> takes minutes. Knowledge compounds.

This skill is inspired by [Every.to's compound-engineering plugin](https://github.com/EveryInc/compound-engineering-plugin).

## Overview

Document solved problems to build searchable institutional knowledge.
Automatically detects recurring issues and promotes them to patterns.

## Implementation Summary

### Skill Files

```
skills/compound-docs/
├── SKILL.md              # Main skill instructions, templates, workflow
├── skill.json            # Metadata, prompts, file references
└── schema.yaml           # Configuration schema (separate for maintainability)
```

### Key Features

1. **Auto-invoke triggers** - "that worked", "it's fixed", "working now", etc.
2. **Manual command** - `/compound`
3. **Dynamic categories** - Agent can add new categories on the fly
4. **Pattern promotion** - Recurring issues get promoted to patterns.md
5. **Interactive setup** - CLI prompts for configuration during install

### Configuration

Generated at `.opencode/compound-docs.yaml`:

```yaml
output_dir: docs/solutions

categories:
  - developer-experience
  - deployment
  - ui
  - integration
  - performance
  - testing

patterns:
  enabled: true
  threshold: 2
  file: patterns.md
```

### CLI Enhancements (Phase 2)

Added `setup.prompts` support to CLI:

- **Types** (`cli/src/types.ts`):
  - `SetupPromptChoice` - Choice option for select/checkbox
  - `SetupPrompt` - Prompt definition (input, select, checkbox, confirm)
  - `SkillSetup.prompts` - Array of prompts to run
  - `SkillSetup.configFile` - Where to write answers
  - `SkillJson.files` - Additional files to install

- **Library** (`cli/src/lib/prompts.ts`):
  - `runSetupPrompts()` - Runs prompts and collects answers
  - `writeSkillConfig()` - Writes answers to YAML or JSON

- **Registry** (`cli/src/lib/registry.ts`):
  - Updated `fetchSkillFiles()` to handle `files` array
  - Updated `fetchClaudeSkillFiles()` to handle `files` array

### Simplifications from Original

- **Removed severity field** - Not needed for most use cases
- **Simplified categories** - developer-experience, deployment, ui, integration, performance, testing
- **Dynamic category creation** - Agent adds new categories as needed
- **Separated schema** - schema.yaml for easier maintenance

## Consuming Solutions

Other workflows can discover documented solutions:

```bash
# Search by keyword
grep -rl "keyword" docs/solutions/

# Search by category
ls docs/solutions/deployment/

# Search by tag
grep -l "tags:.*docker" docs/solutions/**/*.md
```

`patterns.md` is the primary integration point - check it first for critical patterns.

## Source

Forked from: https://github.com/EveryInc/compound-engineering-plugin/blob/main/plugins/compound-engineering/skills/compound-docs/SKILL.md
