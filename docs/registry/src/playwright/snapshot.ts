#!/usr/bin/env bun
/**
 * Get the accessibility tree snapshot of the current page
 * 
 * Usage:
 *   bun run snapshot.ts
 *
 * Examples:
 *   bun run snapshot.ts
 */

import { launchBrowser, isSessionRunning, SessionClient } from "../../utils/playwright";
import { parseArgs } from "../../utils/utils";

const { flags } = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Get the accessibility tree snapshot of the current page

Shows the page structure in a text format that's easy to read and parse.
This is the recommended way to understand page content before interacting.

Usage:
  bun run snapshot.ts

Examples:
  bun run snapshot.ts
`);
  process.exit(0);
}

async function main() {
  const session = await isSessionRunning();
  
  if (session) {
    const client = new SessionClient(session.port);
    const result = await client.snapshot();
    console.log(`Page: ${result.title}`);
    console.log(`URL: ${result.url}`);
    console.log(`\n${result.snapshot}`);
  } else {
    const { context, page } = await launchBrowser();
    try {
      const url = page.url();
      const title = await page.title();
      const snapshot = await page.locator("body").ariaSnapshot();
      console.log(`Page: ${title}`);
      console.log(`URL: ${url}`);
      console.log(`\n${snapshot}`);
    } finally {
      await context.close();
    }
  }
}

main().catch((err) => {
  console.error(`Snapshot failed: ${err.message}`);
  process.exit(1);
});
