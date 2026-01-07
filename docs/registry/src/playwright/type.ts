#!/usr/bin/env bun
/**
 * Type text into an element on the page
 * 
 * Usage:
 *   bun run type.ts <ref> <text> [--press Enter]
 *
 * Arguments:
 *   ref               Element reference (role:name, text:content, or CSS selector)
 *   text              Text to type
 *
 * Options:
 *   --press <key>     Press a key after typing (e.g., Enter, Tab)
 *
 * Examples:
 *   bun run type.ts "combobox:Search with DuckDuckGo" "github" --press Enter
 *   bun run type.ts "input[name='q']" "search query"
 */

import { launchBrowser, isSessionRunning, SessionClient, getPageContext, getElementSuggestions, formatError } from "../../utils/playwright";
import { parseArgs } from "../../utils/utils";

const { flags, positional } = parseArgs(process.argv.slice(2));

if (flags.help || positional.length < 2) {
  console.log(`
Type text into an element on the page

Usage:
  bun run type.ts <ref> <text> [options]

Arguments:
  ref               Element reference:
                    - role:name (e.g., "combobox:Search")
                    - text:content (e.g., "text:Submit")
                    - CSS selector (e.g., "input[name='q']")
  text              Text to type

Options:
  --press <key>     Press a key after typing (e.g., Enter, Tab)

Examples:
  bun run type.ts "combobox:Search with DuckDuckGo" "github" --press Enter
  bun run type.ts "input[name='q']" "search query"
`);
  process.exit(0);
}

const ref = positional[0];
const text = positional[1];
const pressKey = typeof flags.press === "string" ? flags.press : undefined;

async function main() {
  const session = await isSessionRunning();
  
  if (session) {
    const client = new SessionClient(session.port);
    try {
      const result = await client.type(ref, text, pressKey);
      console.log("Typed text successfully");
      console.log(`  Element: ${ref}`);
      console.log(`  Text: ${text}`);
      if (pressKey) {
        console.log(`  Pressed: ${pressKey}`);
      }
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

      await element.fill(text);

      if (pressKey) {
        if (pressKey === "Enter") {
          await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
            page.keyboard.press(pressKey),
          ]);
        } else {
          await page.keyboard.press(pressKey);
        }
      }

      console.log("Typed text successfully");
      console.log(`  Element: ${ref}`);
      console.log(`  Text: ${text}`);
      if (pressKey) {
        console.log(`  Pressed: ${pressKey}`);
      }
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
  console.error(`Type failed: ${err.message}`);
  process.exit(1);
});
