/**
 * Shared utilities for CLI skills
 * These utilities are copied to user projects and can be customized
 */

/**
 * Parse command line arguments into flags and positional args
 */
export function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

/**
 * Format data as a table for CLI output
 */
export function formatTable(
  rows: Record<string, unknown>[],
  columns: { key: string; header: string; width?: number }[]
): string {
  if (rows.length === 0) {
    return "No results found.";
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const maxContent = Math.max(
      col.header.length,
      ...rows.map((row) => String(row[col.key] ?? "").length)
    );
    return col.width ?? Math.min(maxContent, 50);
  });

  // Build header
  const header = columns
    .map((col, i) => col.header.padEnd(widths[i]))
    .join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");

  // Build rows
  const body = rows.map((row) =>
    columns
      .map((col, i) => {
        const value = String(row[col.key] ?? "");
        return value.length > widths[i]
          ? value.slice(0, widths[i] - 1) + "..."
          : value.padEnd(widths[i]);
      })
      .join("  ")
  );

  return [header, separator, ...body].join("\n");
}

/**
 * Output data in either JSON or human-readable format
 */
export function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (Array.isArray(data)) {
    console.log(data);
  } else if (typeof data === "object" && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      console.log(`${key}: ${value}`);
    }
  } else {
    console.log(data);
  }
}

/**
 * Print error message and exit
 */
export function error(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}
