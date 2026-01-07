#!/usr/bin/env bun
/**
 * Navigate to a URL in the Playwright browser
 * 
 * Usage:
 *   bun run navigate.ts <url>
 *
 * Examples:
 *   bun run navigate.ts https://example.com
 *   bun run navigate.ts https://duckduckgo.com
 */

import { launchBrowser, isSessionRunning, SessionClient, getPageContext, formatError } from "../../utils/playwright";
import { parseArgs } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help || positional.length === 0) {
  console.log(`
Navigate to a URL in the Playwright browser

Usage:
  bun run navigate.ts <url>

Examples:
  bun run navigate.ts https://example.com
  bun run navigate.ts https://duckduckgo.com
`);
  process.exit(0);
}

const url = positional[0];

async function main() {
  const session = await isSessionRunning();
  
  if (session) {
    const client = new SessionClient(session.port);
    try {
      const result = await client.navigate(url);
      console.log("Navigated successfully");
      console.log(`  URL: ${result.url}`);
      console.log(`  Title: ${result.title}`);
    } catch (err) {
      const context = await getPageContext({ url: () => "session" } as any);
      const message = err instanceof Error ? err.message : "Navigation failed";
      console.error(`${message} at ${url}`);
      process.exit(1);
    }
  } else {
    const { context, page } = await launchBrowser();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      console.log("Navigated successfully");
      console.log(`  URL: ${page.url()}`);
      console.log(`  Title: ${await page.title()}`);
    } catch (err) {
      const context = await getPageContext(page);
      const message = err instanceof Error ? err.message : "Navigation failed";
      console.error(`${message} ${context}`);
      process.exit(1);
    } finally {
      await context.close();
    }
  }
}

main().catch((err) => {
  console.error(`Navigation failed: ${err.message}`);
  process.exit(1);
});
