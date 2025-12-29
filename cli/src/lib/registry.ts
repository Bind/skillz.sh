import { fetchFile, fetchJson } from "./github.ts";
import {
  SKILLS_DIR,
  type Registry,
  type RegistrySkill,
  type SkillJson,
} from "../types.ts";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export async function fetchRegistry(registryUrl: string): Promise<Registry> {
  return fetchJson<Registry>(registryUrl, "registry.json");
}

export interface FileToInstall {
  /** Path relative to skill install directory */
  relativePath: string;
  content: string;
}

/**
 * Fetches skill.json for a skill from skills/<name>/skill.json
 */
export async function fetchSkillJson(
  registryUrl: string,
  skillName: string
): Promise<SkillJson | null> {
  try {
    return await fetchJson<SkillJson>(
      registryUrl,
      `skills/${skillName}/skill.json`
    );
  } catch {
    return null;
  }
}

/**
 * Fetches a single util file from utils/
 */
export async function fetchUtilFile(
  registryUrl: string,
  utilPath: string
): Promise<string> {
  return fetchFile(registryUrl, `utils/${utilPath}`);
}

/**
 * Check if a util file exists locally
 */
export async function utilExists(
  utilsDir: string,
  utilPath: string
): Promise<boolean> {
  const fullPath = join(utilsDir, utilPath);
  const file = Bun.file(fullPath);
  return file.exists();
}

/**
 * Install a util file to the utils directory
 */
export async function installUtil(
  utilsDir: string,
  utilPath: string,
  content: string
): Promise<string> {
  const fullPath = join(utilsDir, utilPath);
  const dir = dirname(fullPath);

  await mkdir(dir, { recursive: true });
  await Bun.write(fullPath, content);

  return fullPath;
}

/**
 * Transform import paths for installed skill files.
 * Source files import from ../../utils/ but installed files
 * at .opencode/skill/<name>/ need ../../../utils/
 */
function transformImports(content: string): string {
  return content.replace(
    /from ["']\.\.\/\.\.\/utils\//g,
    'from "../../../utils/'
  );
}

/**
 * Fetches all files for a skill:
 * - SKILL.md from skills/<name>/
 * - Entry files from paths specified in skill.json (with import transformation)
 */
export async function fetchSkillFiles(
  registryUrl: string,
  skillName: string
): Promise<FileToInstall[]> {
  const files: FileToInstall[] = [];

  // Fetch SKILL.md
  const skillMdContent = await fetchFile(
    registryUrl,
    `skills/${skillName}/SKILL.md`
  );
  files.push({ relativePath: "SKILL.md", content: skillMdContent });

  // Fetch skill.json to get entry points
  const skillJson = await fetchSkillJson(registryUrl, skillName);

  if (skillJson?.entry) {
    for (const [outputName, sourcePath] of Object.entries(skillJson.entry)) {
      const content = await fetchFile(registryUrl, sourcePath);
      const transformedContent = transformImports(content);
      files.push({
        relativePath: `${outputName}.ts`,
        content: transformedContent,
      });
    }
  }

  return files;
}

/**
 * Installs a skill with all its files into .opencode/skill/<name>/
 */
export async function installSkillFiles(
  skillName: string,
  files: FileToInstall[]
): Promise<string[]> {
  const skillDir = join(SKILLS_DIR, skillName);
  const installedPaths: string[] = [];

  for (const file of files) {
    const fullPath = join(skillDir, file.relativePath);
    const dir = dirname(fullPath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Write file
    await Bun.write(fullPath, file.content);
    installedPaths.push(fullPath);
  }

  return installedPaths;
}

export async function skillExists(skillName: string): Promise<boolean> {
  const skillPath = join(SKILLS_DIR, skillName, "SKILL.md");
  const file = Bun.file(skillPath);
  return file.exists();
}

export interface SkillWithRegistry extends RegistrySkill {
  registry: string;
  registryName: string;
}

export async function fetchAllSkills(
  registries: string[]
): Promise<SkillWithRegistry[]> {
  const allSkills: SkillWithRegistry[] = [];

  for (const registryUrl of registries) {
    try {
      const registry = await fetchRegistry(registryUrl);
      for (const skill of registry.skills) {
        allSkills.push({
          ...skill,
          registry: registryUrl,
          registryName: registry.name,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch registry ${registryUrl}: ${message}`);
    }
  }

  return allSkills;
}

/**
 * Read and parse the user's package.json
 */
export async function readPackageJson(): Promise<Record<string, unknown> | null> {
  const file = Bun.file("package.json");
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Update package.json with new devDependencies
 * Returns list of newly added dependencies
 */
export async function updatePackageJson(
  newDeps: Record<string, string>
): Promise<string[]> {
  const pkg = (await readPackageJson()) ?? { type: "module" };
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  const added: string[] = [];

  for (const [name, version] of Object.entries(newDeps)) {
    if (!devDeps[name]) {
      devDeps[name] = version;
      added.push(`${name}@${version}`);
    }
  }

  if (added.length > 0) {
    pkg.devDependencies = devDeps;
    await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n");
  }

  return added;
}
