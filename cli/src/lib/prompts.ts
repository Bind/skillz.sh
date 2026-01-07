import { input, select, checkbox, confirm } from "@inquirer/prompts";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { stringify } from "yaml";
import type { SetupPrompt, SetupPromptChoice } from "../types.ts";

/**
 * Run setup prompts and collect answers.
 */
export async function runSetupPrompts(
  prompts: SetupPrompt[]
): Promise<Record<string, unknown>> {
  const answers: Record<string, unknown> = {};

  for (const prompt of prompts) {
    const answer = await runPrompt(prompt);
    answers[prompt.name] = answer;
  }

  return answers;
}

/**
 * Run a single prompt based on its type.
 */
async function runPrompt(prompt: SetupPrompt): Promise<unknown> {
  switch (prompt.type) {
    case "input":
      return input({
        message: prompt.message,
        default: typeof prompt.default === "string" ? prompt.default : undefined,
      });

    case "confirm":
      return confirm({
        message: prompt.message,
        default: typeof prompt.default === "boolean" ? prompt.default : true,
      });

    case "select": {
      const choices = normalizeChoices(prompt.choices ?? []);
      return select({
        message: prompt.message,
        choices: choices.map((c) => ({
          name: c.name ?? c.value,
          value: c.value,
        })),
        default: typeof prompt.default === "string" ? prompt.default : undefined,
      });
    }

    case "checkbox": {
      const choices = normalizeChoices(prompt.choices ?? []);
      return checkbox({
        message: prompt.message,
        choices: choices.map((c) => ({
          name: c.name ?? c.value,
          value: c.value,
          checked: c.checked ?? false,
        })),
      });
    }

    default:
      throw new Error(`Unknown prompt type: ${(prompt as SetupPrompt).type}`);
  }
}

/**
 * Normalize choices to SetupPromptChoice array.
 * Handles both string[] and SetupPromptChoice[] formats.
 */
function normalizeChoices(
  choices: SetupPromptChoice[] | string[]
): SetupPromptChoice[] {
  return choices.map((choice) => {
    if (typeof choice === "string") {
      return { value: choice };
    }
    return choice;
  });
}

/**
 * Write config answers to a file.
 * Supports YAML (.yaml, .yml) and JSON (.json) based on extension.
 */
export async function writeSkillConfig(
  configPath: string,
  answers: Record<string, unknown>
): Promise<void> {
  // Ensure directory exists
  const dir = dirname(configPath);
  await mkdir(dir, { recursive: true });

  // Determine format from extension
  const ext = configPath.toLowerCase();
  let content: string;

  if (ext.endsWith(".yaml") || ext.endsWith(".yml")) {
    content = stringify(answers);
  } else {
    content = JSON.stringify(answers, null, 2) + "\n";
  }

  await Bun.write(configPath, content);
}
