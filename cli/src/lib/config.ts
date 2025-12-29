import {
  CONFIG_FILE,
  DEFAULT_REGISTRY,
  DEFAULT_UTILS_DIR,
  type SkzConfig,
} from "../types.ts";

export async function configExists(): Promise<boolean> {
  const file = Bun.file(CONFIG_FILE);
  return file.exists();
}

export async function readConfig(): Promise<SkzConfig | null> {
  const file = Bun.file(CONFIG_FILE);
  if (!(await file.exists())) {
    return null;
  }
  try {
    const content = await file.json();
    return content as SkzConfig;
  } catch {
    return null;
  }
}

export async function writeConfig(config: SkzConfig): Promise<void> {
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export function createDefaultConfig(): SkzConfig {
  return {
    $schema: "https://skillz.sh/schema.json",
    registries: [DEFAULT_REGISTRY],
    utils: DEFAULT_UTILS_DIR,
  };
}
