import { $ } from "bun";

function parseRegistryUrl(registry: string): { owner: string; repo: string } {
  // Format: github:owner/repo
  const match = registry.match(/^github:([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid registry format: ${registry}. Expected: github:owner/repo`
    );
  }
  return { owner: match[1]!, repo: match[2]! };
}

export async function fetchFile(
  registry: string,
  path: string
): Promise<string> {
  const { owner, repo } = parseRegistryUrl(registry);
  const endpoint = `/repos/${owner}/${repo}/contents/${path}`;

  try {
    const result =
      await $`gh api ${endpoint} --header "Accept: application/vnd.github.raw+json"`.text();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("404") || message.includes("Not Found")) {
      throw new Error(`File not found: ${path} in ${registry}`);
    }

    if (
      message.includes("gh: command not found") ||
      message.includes("not logged in")
    ) {
      throw new Error(
        "GitHub CLI (gh) is required. Install it and run `gh auth login`.\n" +
          "https://cli.github.com/"
      );
    }

    throw new Error(`Failed to fetch ${path}: ${message}`);
  }
}

export async function fetchJson<T>(registry: string, path: string): Promise<T> {
  const content = await fetchFile(registry, path);
  return JSON.parse(content) as T;
}

export interface FileInfo {
  name: string;
  path: string;
  type: "file" | "dir";
}

/**
 * Lists contents of a directory in the repo
 */
export async function listDirectory(
  registry: string,
  path: string
): Promise<FileInfo[]> {
  const { owner, repo } = parseRegistryUrl(registry);
  const endpoint = `/repos/${owner}/${repo}/contents/${path}`;

  try {
    const result = await $`gh api ${endpoint}`.json();

    if (!Array.isArray(result)) {
      // Single file, not a directory
      return [
        {
          name: result.name,
          path: result.path,
          type: result.type === "dir" ? "dir" : "file",
        },
      ];
    }

    return result.map((item: { name: string; path: string; type: string }) => ({
      name: item.name,
      path: item.path,
      type: item.type === "dir" ? "dir" : "file",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404") || message.includes("Not Found")) {
      throw new Error(`Directory not found: ${path} in ${registry}`);
    }
    throw new Error(`Failed to list directory ${path}: ${message}`);
  }
}

/**
 * Recursively fetches all files in a directory
 */
export async function fetchDirectoryFiles(
  registry: string,
  dirPath: string
): Promise<{ relativePath: string; content: string }[]> {
  const files: { relativePath: string; content: string }[] = [];
  const items = await listDirectory(registry, dirPath);

  for (const item of items) {
    if (item.type === "file") {
      const content = await fetchFile(registry, item.path);
      // Get path relative to the original dirPath
      const relativePath = item.path.startsWith(dirPath + "/")
        ? item.path.slice(dirPath.length + 1)
        : item.name;
      files.push({ relativePath, content });
    } else if (item.type === "dir") {
      // Recursively fetch subdirectory
      const subFiles = await fetchDirectoryFiles(registry, item.path);
      const subDirName = item.name;
      for (const subFile of subFiles) {
        files.push({
          relativePath: `${subDirName}/${subFile.relativePath}`,
          content: subFile.content,
        });
      }
    }
  }

  return files;
}
