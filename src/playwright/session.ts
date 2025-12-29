#!/usr/bin/env bun
/**
 * Manage a persistent Playwright browser session via a local server
 * 
 * The session runs as a background process and accepts commands via HTTP.
 * This allows multiple CLI commands to interact with the same browser instance.
 *
 * Usage:
 *   bun run session.ts start    Start the session server
 *   bun run session.ts stop     Stop the session server
 *   bun run session.ts status   Check if session is running
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { parseArgs } from "../../utils/utils";
import { parseElementRef, getPageContext, formatError, getElementSuggestions } from "../../utils/playwright";
import { join } from "node:path";

const { flags, positional } = parseArgs(process.argv.slice(2));
const command = positional[0];

const PORT = typeof flags.port === "string" ? parseInt(flags.port, 10) : 9559;
const SESSION_FILE = join(process.cwd(), ".playwright-data", ".session.json");
const USER_DATA_DIR = join(process.cwd(), ".playwright-data");

interface SessionInfo {
  pid: number;
  port: number;
  startedAt: string;
}

async function readSessionInfo(): Promise<SessionInfo | null> {
  try {
    const file = Bun.file(SESSION_FILE);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return null;
}

async function writeSessionInfo(info: SessionInfo): Promise<void> {
  await Bun.write(SESSION_FILE, JSON.stringify(info, null, 2));
}

async function clearSessionInfo(): Promise<void> {
  try {
    const file = Bun.file(SESSION_FILE);
    if (await file.exists()) {
      const { unlink } = await import("node:fs/promises");
      await unlink(SESSION_FILE);
    }
  } catch {
    // Ignore
  }
}

async function isSessionRunning(): Promise<boolean> {
  const info = await readSessionInfo();
  if (!info) return false;
  
  try {
    const response = await fetch(`http://localhost:${info.port}/status`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============ Session Server ============

async function startServer() {
  const headless = flags.headless === true;
  const width = typeof flags.width === "string" ? parseInt(flags.width, 10) : 1280;
  const height = typeof flags.height === "string" ? parseInt(flags.height, 10) : 720;

  if (await isSessionRunning()) {
    const info = await readSessionInfo();
    console.log(`Session already running on port ${info?.port}`);
    return;
  }

  console.log(`Starting Playwright session...`);
  console.log(`  Mode: ${headless ? "headless" : "headed"}`);
  console.log(`  Viewport: ${width}x${height}`);
  console.log(`  Port: ${PORT}`);

  let context: BrowserContext;
  let page: Page;

  try {
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless,
      viewport: { width, height },
      acceptDownloads: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to launch browser: ${message}`);
    console.error("Try: bunx playwright install chromium");
    process.exit(1);
  }

  const pages = context.pages();
  page = pages.length > 0 ? pages[0]! : await context.newPage();

  function getLocator(ref: string) {
    const { type, value } = parseElementRef(ref);
    if (type === "text") {
      return page.getByText(value);
    }
    if (type === "selector") {
      return page.locator(ref);
    }
    // Treat any other type as a role name (combobox, button, link, etc.)
    return page.getByRole(type as Parameters<typeof page.getByRole>[0], { name: value });
  }

  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        if (path === "/status") {
          return Response.json({
            status: "running",
            url: page.url(),
            title: await page.title(),
          });
        }

        if (path === "/navigate") {
          const targetUrl = url.searchParams.get("url");
          if (!targetUrl) {
            return Response.json({ error: "url parameter required" }, { status: 400 });
          }
          try {
            await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });
          } catch (err) {
            const context = await getPageContext(page);
            const message = err instanceof Error ? err.message : "Navigation failed";
            return Response.json({ error: `${message} ${context}` }, { status: 500 });
          }
          return Response.json({
            status: "navigated",
            url: page.url(),
            title: await page.title(),
          });
        }

        if (path === "/snapshot") {
          const snapshot = await page.locator("body").ariaSnapshot();
          return Response.json({
            url: page.url(),
            title: await page.title(),
            snapshot,
          });
        }

        if (path === "/screenshot") {
          const fullPage = url.searchParams.get("full") === "true";
          try {
            const buffer = await page.screenshot({ fullPage });
            return new Response(buffer, {
              headers: { "Content-Type": "image/png" },
            });
          } catch (err) {
            return Response.json({ error: `Screenshot failed: ${err}` }, { status: 500 });
          }
        }

        if (path === "/type") {
          const ref = url.searchParams.get("ref");
          const text = url.searchParams.get("text");
          const pressKey = url.searchParams.get("press");
          
          if (!ref || !text) {
            return Response.json({ error: "ref and text parameters required" }, { status: 400 });
          }

          let element;
          try {
            element = getLocator(ref);
            await element.waitFor({ state: "visible", timeout: 10000 });
          } catch (err) {
            const context = await getPageContext(page);
            const suggestions = getElementSuggestions(ref);
            const message = `Element '${ref}' not found`;
            return Response.json({ error: formatError(message, context, suggestions) }, { status: 404 });
          }

          try {
            await element.fill(text);
          } catch (err) {
            return Response.json({ error: `Failed to type text: ${err}` }, { status: 500 });
          }

          if (pressKey) {
            try {
              if (pressKey === "Enter") {
                await Promise.all([
                  page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
                  page.keyboard.press(pressKey),
                ]);
              } else {
                await page.keyboard.press(pressKey);
              }
            } catch {
              // Ignore navigation errors
            }
          }

          await page.waitForTimeout(300);

          return Response.json({
            status: "typed",
            url: page.url(),
            title: await page.title(),
          });
        }

        if (path === "/click") {
          const ref = url.searchParams.get("ref");
          if (!ref) {
            return Response.json({ error: "ref parameter required" }, { status: 400 });
          }

          let element;
          try {
            element = getLocator(ref);
            await element.waitFor({ state: "visible", timeout: 10000 });
          } catch (err) {
            const context = await getPageContext(page);
            const suggestions = getElementSuggestions(ref);
            const message = `Element '${ref}' not found`;
            return Response.json({ error: formatError(message, context, suggestions) }, { status: 404 });
          }

          try {
            await element.click();
          } catch (err) {
            return Response.json({ error: `Failed to click element: ${err}` }, { status: 500 });
          }

          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(300);

          return Response.json({
            status: "clicked",
            url: page.url(),
            title: await page.title(),
          });
        }

        if (path === "/stop") {
          setTimeout(async () => {
            await context.close();
            await clearSessionInfo();
            process.exit(0);
          }, 100);
          return Response.json({ status: "stopping" });
        }

        return Response.json({ error: "Unknown endpoint" }, { status: 404 });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: message }, { status: 500 });
      }
    },
  });

  await writeSessionInfo({
    pid: process.pid,
    port: PORT,
    startedAt: new Date().toISOString(),
  });

  console.log(`\nSession started! Browser is ready.`);
  console.log(`Use other playwright commands to interact with this session.`);
  console.log(`Press Ctrl+C or run 'session stop' to end the session.\n`);

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await context.close();
    await clearSessionInfo();
    server.stop();
    process.exit(0);
  });
}

async function stopServer() {
  const info = await readSessionInfo();
  if (!info) {
    console.log("No session running");
    return;
  }

  try {
    await fetch(`http://localhost:${info.port}/stop`);
    console.log("Session stopped");
  } catch {
    console.log("Session not responding, clearing state");
  }
  await clearSessionInfo();
}

async function showStatus() {
  const info = await readSessionInfo();
  if (!info) {
    console.log("No session running");
    return;
  }

  try {
    const response = await fetch(`http://localhost:${info.port}/status`);
    const data = await response.json();
    console.log("Session running:");
    console.log(`  Port: ${info.port}`);
    console.log(`  PID: ${info.pid}`);
    console.log(`  Started: ${info.startedAt}`);
    console.log(`  URL: ${data.url}`);
    console.log(`  Title: ${data.title}`);
  } catch {
    console.log("Session not responding");
    await clearSessionInfo();
  }
}

// ============ Main ============

if (flags.help || !command) {
  console.log(`
Manage a persistent Playwright browser session

Usage:
  bun run session.ts start    Start the session server
  bun run session.ts stop     Stop the session server
  bun run session.ts status   Check if session is running

Options:
  --headless        Run in headless mode (default: headed)
  --port <n>        Server port (default: 9559)

Examples:
  bun run session.ts start
  bun run session.ts start --headless
  bun run session.ts status
  bun run session.ts stop
`);
  process.exit(0);
}

switch (command) {
  case "start":
    startServer();
    break;
  case "stop":
    stopServer();
    break;
  case "status":
    showStatus();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: session start | stop | status");
    process.exit(1);
}
