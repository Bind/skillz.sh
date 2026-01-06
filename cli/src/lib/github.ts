const DEFAULT_BRANCH = "main";

/**
 * Registry URL formats:
 * - github:owner/repo  -> Uses raw.githubusercontent.com
 * - https://...        -> Direct URL (e.g., https://skillz.sh)
 */

interface RegistryInfo {
  type: "github" | "https";
  baseUrl: string;
  owner?: string;
  repo?: string;
}

function parseRegistry(registry: string): RegistryInfo {
  // Check for https:// URL format
  if (registry.startsWith("https://")) {
    // Remove trailing slash if present
    const baseUrl = registry.replace(/\/$/, "");
    return { type: "https", baseUrl };
  }

  // Check for github:owner/repo format
  const match = registry.match(/^github:([^/]+)\/(.+)$/);
  if (match) {
    const owner = match[1]!;
    const repo = match[2]!;
    return {
      type: "github",
      baseUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${DEFAULT_BRANCH}`,
      owner,
      repo,
    };
  }

  throw new Error(
    `Invalid registry format: ${registry}. Expected: github:owner/repo or https://...`
  );
}

export async function fetchFile(
  registry: string,
  path: string
): Promise<string> {
  const info = parseRegistry(registry);

  let url: string;
  if (info.type === "https") {
    // Direct URL - no cache buster needed (Cloudflare handles caching)
    url = `${info.baseUrl}/${path}`;
  } else {
    // GitHub raw - add cache buster to avoid CDN caching stale content
    const cacheBuster = Date.now();
    url = `${info.baseUrl}/${path}?_=${cacheBuster}`;
  }

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
 * Lists contents of a directory in the repo.
 * Only works with github: registries (uses GitHub API).
 * For https: registries, we fetch files directly by known paths.
 */
export async function listDirectory(
  registry: string,
  path: string
): Promise<FileInfo[]> {
  const info = parseRegistry(registry);

  if (info.type === "https") {
    throw new Error(
      "listDirectory is not supported for https:// registries. " +
      "Use fetchFile with known paths instead."
    );
  }

  const url = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${path}?ref=${DEFAULT_BRANCH}`;

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
 * Recursively fetches all files in a directory.
 * Only works with github: registries (uses GitHub API).
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
