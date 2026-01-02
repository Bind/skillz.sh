const DEFAULT_BRANCH = "main";

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
  // Add cache buster to avoid GitHub CDN caching stale content
  const cacheBuster = Date.now();
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${DEFAULT_BRANCH}/${path}?_=${cacheBuster}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found: ${path} in ${registry}`);
    }
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }

  return response.text();
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
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${DEFAULT_BRANCH}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Directory not found: ${path} in ${registry}`);
    }
    throw new Error(`Failed to list directory ${path}: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as
    | { name: string; path: string; type: string }
    | { name: string; path: string; type: string }[];

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
