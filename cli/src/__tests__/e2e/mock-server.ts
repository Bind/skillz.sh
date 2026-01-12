import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
// Root of the repository (cli/src/__tests__/e2e -> repo root is 4 levels up)
const REPO_ROOT = join(__dirname, "../../../..");

export interface MockServer {
  url: string;
  port: number;
  stop: () => void;
}

/**
 * Start a mock HTTP server serving test fixtures and real source files.
 * Serves:
 * - /registry.json -> fixtures/registry.json (test-specific subset)
 * - /skills/<name>/<file> -> repo root skills/<name>/<file>
 * - /src/<path> -> repo root src/<path>
 * - /utils/<file> -> repo root utils/<file>
 */
export function startMockServer(): MockServer {
  const server = Bun.serve({
    port: 0, // Auto-assign available port
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        // Registry JSON - use test fixture (subset of skills for testing)
        if (path === "/registry.json") {
          const file = Bun.file(join(FIXTURES_DIR, "registry.json"));
          return new Response(await file.text(), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Skills files: /skills/<name>/<file> -> repo root
        if (path.startsWith("/skills/")) {
          const filePath = join(REPO_ROOT, path);
          const file = Bun.file(filePath);
          if (await file.exists()) {
            return new Response(await file.text(), {
              headers: { "Content-Type": "text/plain" },
            });
          }
        }

        // Source files: /src/<path> -> repo root
        if (path.startsWith("/src/")) {
          const filePath = join(REPO_ROOT, path);
          const file = Bun.file(filePath);
          if (await file.exists()) {
            return new Response(await file.text(), {
              headers: { "Content-Type": "text/plain" },
            });
          }
        }

        // Utils files: /utils/<file> -> repo root
        if (path.startsWith("/utils/")) {
          const filePath = join(REPO_ROOT, path);
          const file = Bun.file(filePath);
          if (await file.exists()) {
            return new Response(await file.text(), {
              headers: { "Content-Type": "text/plain" },
            });
          }
        }

        return new Response("Not Found", { status: 404 });
      } catch (error) {
        console.error(`Mock server error for ${path}:`, error);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  });

  const port = server.port!;

  return {
    url: `http://localhost:${port}`,
    port,
    stop: () => server.stop(),
  };
}
