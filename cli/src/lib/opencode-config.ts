import {
  OPENCODE_CONFIG_FILE,
  type OpencodeConfig,
  type McpConfig,
} from "../types.ts";

export async function readOpencodeConfig(): Promise<OpencodeConfig | null> {
  const file = Bun.file(OPENCODE_CONFIG_FILE);
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as OpencodeConfig;
  } catch {
    return null;
  }
}

export async function writeOpencodeConfig(config: OpencodeConfig): Promise<void> {
  await Bun.write(OPENCODE_CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Add MCP servers to opencode.json.
 * Returns list of newly added server names.
 */
export async function addMcpServers(
  servers: Record<string, McpConfig>
): Promise<string[]> {
  let config = await readOpencodeConfig();

  if (!config) {
    config = {
      $schema: "https://opencode.ai/config.json",
      mcp: {},
    };
  }

  if (!config.mcp) {
    config.mcp = {};
  }

  const added: string[] = [];

  for (const [name, mcpConfig] of Object.entries(servers)) {
    if (!config.mcp[name]) {
      config.mcp[name] = mcpConfig;
      added.push(name);
    }
  }

  if (added.length > 0) {
    await writeOpencodeConfig(config);
  }

  return added;
}
