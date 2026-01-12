import { spawn } from "node:child_process";

const PACKAGE_NAME = "@bind/skillz";

interface NpmPackageInfo {
  "dist-tags": {
    latest: string;
  };
}

async function getLatestVersion(): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch package info: ${response.status}`);
  }
  const data = (await response.json()) as NpmPackageInfo;
  return data["dist-tags"].latest;
}

function getCurrentVersion(): string {
  const packageJson = require("../../package.json");
  return packageJson.version;
}

function compareVersions(current: string, latest: string): number {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] ?? 0;
    const l = latestParts[i] ?? 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
}

function runUpgrade(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\nUpgrading ${PACKAGE_NAME}...`);

    const proc = spawn("bun", ["add", "-g", `${PACKAGE_NAME}@latest`], {
      stdio: "inherit",
      shell: true,
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`bun add failed with code ${code}`));
    });
  });
}

export async function upgrade(autoUpgrade = false): Promise<void> {
  const currentVersion = getCurrentVersion();

  console.log(`Current version: ${currentVersion}`);
  console.log("Checking for upgrades...");

  let latestVersion: string;
  try {
    latestVersion = await getLatestVersion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to check for upgrades: ${message}`);
    return;
  }

  const comparison = compareVersions(currentVersion, latestVersion);

  if (comparison === 0) {
    console.log(`You're already on the latest version (${currentVersion})`);
    return;
  }

  if (comparison < 0) {
    console.log(`Your version (${currentVersion}) is newer than npm (${latestVersion})`);
    return;
  }

  console.log(`New version available: ${latestVersion}`);

  if (autoUpgrade) {
    await runUpgrade();
    console.log(`\nUpgraded to ${latestVersion}`);
  } else {
    console.log(`\nRun to upgrade: bun add -g ${PACKAGE_NAME}@latest`);
    console.log(`Or run: skz upgrade --yes`);
  }
}
