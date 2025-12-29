/**
 * Playwright browser utilities
 * These utilities are copied to user projects and can be customized
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { join } from "node:path";

const USER_DATA_DIR = join(process.cwd(), ".playwright-data");
const SESSION_FILE = join(USER_DATA_DIR, ".session.json");

const DEFAULT_SESSION_PORT = 9559;

interface SessionInfo {
  pid: number;
  port: number;
  startedAt: string;
}

/**
 * Read session info from disk
 */
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

/**
 * Check if a session server is running
 */
export async function isSessionRunning(): Promise<SessionInfo | null> {
  const info = await readSessionInfo();
  if (!info) return null;

  try {
    const response = await fetch(`http://localhost:${info.port}/status`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      return info;
    }
  } catch {
    // Session not responding
  }
  return null;
}

/**
 * Get the session server port
 */
export function getSessionPort(): number {
  return DEFAULT_SESSION_PORT;
}

/**
 * Session client for interacting with a running session
 */
export class SessionClient {
  constructor(private port: number = DEFAULT_SESSION_PORT) {}

  private async request(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(`http://localhost:${this.port}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  async status(): Promise<{ status: string; url: string; title: string }> {
    return this.request("/status") as Promise<{ status: string; url: string; title: string }>;
  }

  async navigate(url: string): Promise<{ status: string; url: string; title: string }> {
    return this.request("/navigate", { url }) as Promise<{ status: string; url: string; title: string }>;
  }

  async snapshot(): Promise<{ url: string; title: string; snapshot: string }> {
    return this.request("/snapshot") as Promise<{ url: string; title: string; snapshot: string }>;
  }

  async type(ref: string, text: string, press?: string): Promise<{ status: string; url: string; title: string }> {
    const params: Record<string, string> = { ref, text };
    if (press) params.press = press;
    return this.request("/type", params) as Promise<{ status: string; url: string; title: string }>;
  }

  async click(ref: string): Promise<{ status: string; url: string; title: string }> {
    return this.request("/click", { ref }) as Promise<{ status: string; url: string; title: string }>;
  }

  async screenshot(full?: boolean): Promise<Buffer> {
    const url = new URL(`http://localhost:${this.port}/screenshot`);
    if (full) url.searchParams.set("full", "true");
    const response = await fetch(url.toString());
    return Buffer.from(await response.arrayBuffer());
  }

  async stop(): Promise<void> {
    await this.request("/stop");
  }
}

/**
 * Parse element reference into a locator
 * Supports: role:name, text:content, CSS selector
 */
export function parseElementRef(ref: string): { type: string; value: string } {
  const roleMatch = ref.match(/^(\w+):(.+)$/);
  if (roleMatch) {
    const [, type, value] = roleMatch;
    return { type, value };
  }
  return { type: "selector", value: ref };
}

/**
 * Create a locator from an element reference
 */
export function createLocator(page: Page, ref: string) {
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

/**
 * Get current page context for error messages
 */
export async function getPageContext(page: Page): Promise<string> {
  try {
    return `at ${page.url()} (${await page.title()})`;
  } catch {
    return "on current page";
  }
}

/**
 * Format error with helpful guidance
 */
export function formatError(message: string, context: string, suggestions: string[]): string {
  const parts = [message, context];
  if (suggestions.length > 0) {
    parts.push("Try: " + suggestions.join(", or "));
  }
  return parts.join(" ");
}

/**
 * Common error suggestions for element operations
 */
export function getElementSuggestions(ref: string): string[] {
  const suggestions = ["snapshot to see available elements"];
  const { type, value } = parseElementRef(ref);

  if (type === "selector") {
    suggestions.push(`role:${value} for role-based matching`);
  }
  if (type === "text") {
    suggestions.push(`selector for CSS-based matching`);
  }
  suggestions.push("page refresh");

  return suggestions;
}

/**
 * Launch a new persistent browser context (standalone mode)
 */
export async function launchBrowser(options?: {
  headless?: boolean;
  width?: number;
  height?: number;
}): Promise<{ context: BrowserContext; page: Page }> {
  const headless = options?.headless ?? false;
  const width = options?.width ?? 1280;
  const height = options?.height ?? 720;

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: { width, height },
    acceptDownloads: true,
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0]! : await context.newPage();

  return { context, page };
}

/**
 * Get the user data directory path
 */
export function getUserDataDir(): string {
  return USER_DATA_DIR;
}

/**
 * Clear browser data directory
 */
export async function clearBrowserData(): Promise<void> {
  const { rm } = await import("node:fs/promises");
  try {
    await rm(USER_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
}
