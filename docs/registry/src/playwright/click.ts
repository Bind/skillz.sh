#!/usr/bin/env bun
/**
 * Click an element on the page
 * 
 * Usage:
 *   bun run click.ts <ref>
 *
 * Arguments:
 *   ref               Element reference (role:name, text:content, or CSS selector)
 *
 * Examples:
 *   bun run click.ts "button:Submit"
 *   bun run click.ts "link:Sign in"
 *   bun run click.ts "#login-btn"
 */

import { launchBrowser, isSessionRunning, SessionClient, getPageContext, getElementSuggestions, formatError } from "../../utils/playwright";
import { parseArgs } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help || positional.length === 0) {
  console.log(`
Click an element on the page

Usage:
  bun run click.ts <ref>

Arguments:
  ref               Element reference:
                    - role:name (e.g., "button:Submit")
                    - text:content (e.g., "text:Click here")
                    - CSS selector (e.g., "#login-btn")

Examples:
  bun run click.ts "button:Submit"
  bun run click.ts "link:Sign in"
  bun run click.ts "#login-btn"
`);
  process.exit(0);
}

const ref = positional[0];

async function main() {
  const session = await isSessionRunning();
  
  if (session) {
    const client = new SessionClient(session.port);
    try {
      const result = await client.click(ref);
      console.log("Clicked element successfully");
      console.log(`  Element: ${ref}`);
      console.log(`  URL: ${result.url}`);
      console.log(`  Title: ${result.title}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Element operation failed";
      if (message.includes("not found")) {
        const context = await getPageContext({ url: () => "session" } as any);
        const suggestions = getElementSuggestions(ref);
        console.error(formatError(message, context, suggestions));
      } else {
        console.error(message);
      }
      process.exit(1);
    }
  } else {
    const { context, page } = await launchBrowser();
    try {
      let element;
      try {
        element = page.locator(ref);
        await element.waitFor({ state: "visible", timeout: 10000 });
      } catch (locatorErr) {
        const contextStr = await getPageContext(page);
        const suggestions = getElementSuggestions(ref);
        const message = locatorErr instanceof Error ? locatorErr.message : "Invalid selector";
        console.error(formatError(`Element '${ref}' not found or invalid selector`, contextStr, suggestions));
        try {
          await context.close();
        } catch {
          // Ignore close errors
        }
        process.exit(1);
      }
      
      await element.click();
      await page.waitForLoadState("networkidle").catch(() => {});

      console.log("Clicked element successfully");
      console.log(`  Element: ${ref}`);
      console.log(`  URL: ${page.url()}`);
      console.log(`  Title: ${await page.title()}`);
      await context.close();
    } catch (err) {
      const contextStr = await getPageContext(page);
      const suggestions = getElementSuggestions(ref);
      const message = err instanceof Error ? err.message : "Element operation failed";
      if (message.includes("Timeout") || message.includes("not found")) {
        console.error(formatError(`Element '${ref}' not found`, contextStr, suggestions));
      } else {
        console.error(`${message} ${contextStr}`);
      }
      try {
        await context.close();
      } catch {
        // Ignore close errors
      }
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(`Click failed: ${err.message}`);
  process.exit(1);
});
