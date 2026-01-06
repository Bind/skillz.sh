#!/usr/bin/env bun
/**
 * Take a screenshot of the current browser page
 * 
 * Usage:
 *   bun run screenshot.ts [--output <path>]
 *
 * Options:
 *   --output <path>   Output file path (default: screenshot.png)
 *   --full            Capture full page
 *
 * Examples:
 *   bun run screenshot.ts
 *   bun run screenshot.ts --output page.png
 *   bun run screenshot.ts --output full.png --full
 */

import { launchBrowser, isSessionRunning, SessionClient } from "../../utils/playwright";
import { parseArgs } from "../../utils/utils";
import { resolve } from "node:path";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Take a screenshot of the current browser page

Usage:
  bun run screenshot.ts [options]

Options:
  --output <path>   Output file path (default: screenshot.png)
  --full            Capture full page (scrolls entire page)

Examples:
  bun run screenshot.ts
  bun run screenshot.ts --output page.png
  bun run screenshot.ts --output full.png --full
`);
  process.exit(0);
}

const outputPath = typeof flags.output === "string" ? flags.output : "screenshot.png";
const fullPage = flags.full === true;
const absolutePath = resolve(outputPath);

async function main() {
  const session = await isSessionRunning();
  
  if (session) {
    const client = new SessionClient(session.port);
    try {
      const buffer = await client.screenshot(fullPage);
      await Bun.write(absolutePath, buffer);
      const status = await client.status();
      console.log("Screenshot saved");
      console.log(`  Path: ${absolutePath}`);
      console.log(`  URL: ${status.url}`);
      console.log(`  Title: ${status.title}`);
      console.log(`  Full page: ${fullPage}`);
    } catch (err) {
      console.error(`Screenshot failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    const { context, page } = await launchBrowser();
    try {
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: absolutePath,
        fullPage,
      });
      console.log("Screenshot saved");
      console.log(`  Path: ${absolutePath}`);
      console.log(`  URL: ${page.url()}`);
      console.log(`  Title: ${await page.title()}`);
      console.log(`  Full page: ${fullPage}`);
    } catch (err) {
      console.error(`Screenshot failed: ${err.message}`);
      process.exit(1);
    } finally {
      await context.close();
    }
  }
}

main().catch((err) => {
  console.error(`Screenshot failed: ${err.message}`);
  process.exit(1);
});
