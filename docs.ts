#!/usr/bin/env bun

/**
 * Documentation generator for skillz.sh
 * Generates static HTML pages from the registry and SKILL.md files.
 */

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const DOCS_DIR = "docs";
const SKILLS_DIR = "skills";
const REGISTRY_FILE = "registry.json";

// ============================================================================
// Types
// ============================================================================

interface SkillFiles {
  skill: string[];
  commands?: Record<string, string[]>;
  agents?: string[];
  entry?: Record<string, string>;
  static?: string[];
}

interface SkillSetup {
  env?: string[];
  instructions?: string;
  prompts?: unknown[];
  configFile?: string;
}

interface RegistrySkill {
  name: string;
  description: string;
  version: string;
  domain?: string;
  requires?: string[];
  utils?: string[];
  dependencies?: Record<string, string>;
  setup?: SkillSetup;
  files: SkillFiles;
}

interface RegistryAgent {
  name: string;
  description: string;
  version: string;
  files: string[];
  mcp?: Record<string, unknown>;
  skills?: string[];
  demo?: string;
}

interface Registry {
  name: string;
  version: string;
  basePath?: string;
  skills: RegistrySkill[];
  agents: RegistryAgent[];
  utils: string[];
}

// ============================================================================
// Markdown Parser (simple)
// ============================================================================

function parseMarkdown(content: string): string {
  // Remove frontmatter
  const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, "");

  // Process line by line for better control
  const lines = withoutFrontmatter.split("\n");
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockContent: string[] = [];

  for (const line of lines) {
    // Handle code blocks
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim() || "text";
        codeBlockContent = [];
      } else {
        // End code block
        inCodeBlock = false;
        const escapedCode = escapeHtml(codeBlockContent.join("\n"));
        blocks.push(`<pre><code class="language-${codeBlockLang}">${escapedCode}</code></pre>`);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line = new block
    if (line.trim() === "") {
      if (currentBlock.length > 0) {
        blocks.push(processBlock(currentBlock));
        currentBlock = [];
      }
      continue;
    }

    currentBlock.push(line);
  }

  // Don't forget the last block
  if (currentBlock.length > 0) {
    blocks.push(processBlock(currentBlock));
  }

  return blocks.join("\n");
}

function processBlock(lines: string[]): string {
  const firstLine = lines[0] ?? "";

  // Check if block contains mixed content (paragraph followed by list)
  // Split and process separately
  const listStartIndex = lines.findIndex((l, i) => i > 0 && l.startsWith("- ") && !lines[i - 1]?.startsWith("- "));
  if (listStartIndex > 0 && !firstLine.startsWith("- ")) {
    const paragraphLines = lines.slice(0, listStartIndex);
    const listLines = lines.slice(listStartIndex);
    return processBlock(paragraphLines) + "\n" + processBlock(listLines);
  }

  // Headers
  if (firstLine.startsWith("#### ")) {
    const text = firstLine.slice(5);
    return `<h4 class="text-base font-semibold mt-5 mb-2 text-zinc-200">${processInline(text)}</h4>`;
  }
  if (firstLine.startsWith("### ")) {
    const text = firstLine.slice(4);
    return `<h3 class="text-lg font-semibold mt-6 mb-2">${processInline(text)}</h3>`;
  }
  if (firstLine.startsWith("## ")) {
    const text = firstLine.slice(3);
    return `<h2 class="text-xl font-semibold mt-8 mb-3 pb-2 border-b border-zinc-800">${processInline(text)}</h2>`;
  }
  if (firstLine.startsWith("# ")) {
    const text = firstLine.slice(2);
    return `<h1 class="text-2xl font-bold mt-8 mb-4">${processInline(text)}</h1>`;
  }

  // Horizontal rule
  if (firstLine === "---") {
    return '<hr class="my-6 border-zinc-800">';
  }

  // List
  if (firstLine.startsWith("- ")) {
    const items = lines
      .filter((l) => l.startsWith("- "))
      .map((l) => `<li class="ml-4">${processInline(l.slice(2))}</li>`)
      .join("\n");
    return `<ul class="my-3 list-disc list-inside space-y-1">\n${items}\n</ul>`;
  }

  // Table
  if (firstLine.startsWith("|")) {
    const rows = lines.filter((l) => l.startsWith("|") && !l.match(/^\|[\s-|]+\|$/));
    const rowsHtml = rows.map((row, i) => {
      const cells = row.split("|").filter(Boolean).map((c) => c.trim());
      const tag = i === 0 ? "th" : "td";
      const cellClass = i === 0 
        ? "px-3 py-2 border border-zinc-800 bg-zinc-900 text-left font-medium"
        : "px-3 py-2 border border-zinc-800";
      const cellsHtml = cells.map((c) => `<${tag} class="${cellClass}">${processInline(c)}</${tag}>`).join("");
      return `<tr>${cellsHtml}</tr>`;
    }).join("\n");
    return `<table class="my-4 w-full border-collapse text-sm">\n<tbody>\n${rowsHtml}\n</tbody>\n</table>`;
  }

  // Paragraph
  const text = lines.join(" ");
  return `<p class="my-3 text-zinc-400">${processInline(text)}</p>`;
}

function processInline(text: string): string {
  return text
    // Inline code (must come before other formatting)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong class=\"text-zinc-200\">$1</strong>")
    // Italic
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-zinc-300 underline hover:text-white">$1</a>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================================
// HTML Templates
// ============================================================================

function baseTemplate(title: string, content: string, breadcrumb?: string, activePage?: string, sidebarHtml?: string): string {
  const navLinks = [
    { href: "/", label: "Skills", id: "skills" },
    { href: "/agents.html", label: "Agents", id: "agents" },
    { href: "/getting-started.html", label: "Getting Started", id: "getting-started" },
    { href: "https://github.com/Bind/skillz.sh", label: "GitHub", id: "github" },
  ];

  const navHtml = navLinks
    .map(({ href, label, id }) => {
      const isActive = activePage === id;
      const classes = isActive ? "text-white" : "text-zinc-400 hover:text-white";
      return `<a href="${href}" class="${classes}">${label}</a>`;
    })
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - skillz.sh</title>
  <meta name="description" content="Skills for AI coding agents">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script>hljs.highlightAll();</script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; }
    pre { background: #18181b; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; border: 1px solid #27272a; }
    pre code { background: transparent !important; padding: 0 !important; }
    code { font-family: ui-monospace, monospace; font-size: 0.875rem; }
    :not(pre) > code { background: #27272a; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
    .hljs { background: transparent !important; }
  </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen">
  <header class="border-b border-zinc-800">
    <div class="flex items-center px-6 py-4">
      <a href="/" class="text-xl font-mono font-bold hover:text-zinc-300 tracking-tight mr-8">SKZ</a>
      <nav class="flex items-center gap-6 text-sm">
        ${navHtml}
      </nav>
    </div>
  </header>
  <div class="flex">
    ${sidebarHtml ? `
    <aside class="w-48 flex-shrink-0 py-6 pl-6 pr-4">
      ${sidebarHtml}
    </aside>
    ` : ""}
    <main class="flex-1 max-w-4xl mx-auto py-8 pr-6">
      ${content}
    </main>
  </div>
</body>
</html>`;
}

function indexPage(registry: Registry): string {
  // Group skills by domain
  const byDomain = new Map<string, RegistrySkill[]>();
  for (const skill of registry.skills) {
    const domain = skill.domain ?? "other";
    const list = byDomain.get(domain) ?? [];
    list.push(skill);
    byDomain.set(domain, list);
  }

  // Sort domains, "other" last
  const domains = [...byDomain.keys()].sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  });

  // Domain colors
  const domainColors: Record<string, string> = {
    linear: "text-indigo-400",
    github: "text-zinc-400",
    browser: "text-orange-400",
    database: "text-emerald-400",
    terminal: "text-yellow-400",
    docs: "text-blue-400",
    other: "text-zinc-400",
  };

  // Build domain sidebar
  const sidebarHtml = `
    <nav class="space-y-1">
      ${domains.map(domain => {
        return `
          <a href="#domain-${domain}" class="flex items-center px-3 py-2 text-sm rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-colors">
            <span class="capitalize">${domain}</span>
          </a>
        `;
      }).join("")}
    </nav>
  `;

  let skillsHtml = "";
  for (const domain of domains) {
    const skills = byDomain.get(domain)!;
    const colorClass = domainColors[domain] ?? domainColors.other;

    skillsHtml += `
      <section id="domain-${domain}" class="mb-12">
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-lg font-semibold capitalize ${colorClass}">${domain}</h2>
          <span class="text-sm text-zinc-500">${skills.length} skill${skills.length === 1 ? "" : "s"}</span>
        </div>
        <div class="grid gap-3">
          ${skills
            .map(
              (skill) => `
            <a href="/skills/${skill.name}.html" class="block p-4 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50 transition-colors">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium text-zinc-100">${skill.name}</h3>
                    <span class="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">v${skill.version}</span>
                  </div>
                  <p class="text-sm text-zinc-500 mt-1 line-clamp-2">${skill.description}</p>
                </div>
                <svg class="w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </a>
          `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  const content = `
    <div class="mb-8">
      <code class="text-sm bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800 font-mono">bunx skz add &lt;skill-name&gt;</code>
    </div>
    ${skillsHtml}
  `;

  return baseTemplate("Skills", content, undefined, "skills", sidebarHtml);
}

function skillPage(skill: RegistrySkill, content: string): string {
  const domain = skill.domain ?? "other";

  // Metadata badges
  const badges: string[] = [];
  badges.push(`<span class="text-xs px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400">v${skill.version}</span>`);
  badges.push(`<span class="text-xs px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 capitalize">${domain}</span>`);

  // Install command
  const installCmd = `bunx skz add ${skill.name}`;

  // Dependencies
  let depsHtml = "";
  if (skill.dependencies && Object.keys(skill.dependencies).length > 0) {
    const depsList = Object.entries(skill.dependencies)
      .map(([name, version]) => `<li><code>${name}</code> <span class="text-zinc-500">${version}</span></li>`)
      .join("");
    depsHtml = `
      <div class="mt-6 p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
        <h3 class="text-sm font-medium text-zinc-300 mb-2">Dependencies</h3>
        <ul class="text-sm text-zinc-400 space-y-1">${depsList}</ul>
      </div>
    `;
  }

  // Required skills
  let requiresHtml = "";
  if (skill.requires && skill.requires.length > 0) {
    const reqList = skill.requires
      .map((r) => `<a href="/skills/${r}.html" class="text-zinc-300 underline hover:text-white transition-colors">${r}</a>`)
      .join(", ");
    requiresHtml = `
      <div class="mt-4 text-sm text-zinc-500">
        <span class="text-zinc-400">Requires:</span> ${reqList}
      </div>
    `;
  }

  // Setup instructions
  let setupHtml = "";
  if (skill.setup?.instructions) {
    setupHtml = `
      <div class="mt-6 p-4 rounded-xl border border-amber-900/30 bg-amber-950/20">
        <h3 class="text-sm font-medium text-amber-400 mb-2">Setup Required</h3>
        <p class="text-sm text-zinc-400">${skill.setup.instructions}</p>
      </div>
    `;
  }

  // Environment variables
  let envHtml = "";
  if (skill.setup?.env && skill.setup.env.length > 0) {
    const envList = skill.setup.env.map((e) => `<code>${e}</code>`).join(", ");
    envHtml = `
      <div class="mt-4 text-sm">
        <span class="text-zinc-400">Required env:</span> <span class="text-zinc-300">${envList}</span>
      </div>
    `;
  }

  // Entry points
  let entryHtml = "";
  if (skill.files.entry && Object.keys(skill.files.entry).length > 0) {
    const entryList = Object.keys(skill.files.entry)
      .map((e) => `<code>${e}</code>`)
      .join(", ");
    entryHtml = `
      <div class="mt-4 text-sm">
        <span class="text-zinc-400">Entry points:</span> <span class="text-zinc-300">${entryList}</span>
      </div>
    `;
  }

  const parsedContent = parseMarkdown(content);

  const pageContent = `
    <div class="max-w-4xl">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-3">
          ${badges.join("")}
        </div>
        <h1 class="text-4xl font-bold mb-3 tracking-tight">${skill.name}</h1>
        <p class="text-lg text-zinc-400 leading-relaxed">${skill.description}</p>
      </div>
      
      <!-- Install Command -->
      <div class="mb-8 p-1 rounded-xl bg-gradient-to-r from-zinc-800/50 to-zinc-800/20">
        <div class="flex items-center justify-between gap-4 p-4 rounded-lg bg-zinc-900/80">
          <code class="text-sm text-zinc-300 font-mono">${installCmd}</code>
          <button onclick="navigator.clipboard.writeText('${installCmd}')" class="text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            Copy
          </button>
        </div>
      </div>

      ${requiresHtml}
      ${envHtml}
      ${entryHtml}
      ${setupHtml}
      ${depsHtml}

      <!-- Content -->
      <div class="mt-10">
        <div class="prose prose-invert max-w-none prose-headings:font-semibold prose-a:text-zinc-300 prose-a:underline hover:prose-a:text-white prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
          ${parsedContent}
        </div>
      </div>
    </div>
  `;

  const breadcrumb = `<a href="/" class="hover:text-white transition-colors">Skills</a> <span class="mx-2 text-zinc-600">/</span> <span class="text-zinc-300">${skill.name}</span>`;

  return baseTemplate(skill.name, pageContent, breadcrumb, "skills");
}

function agentsPage(registry: Registry): string {
  const agents = registry.agents;

  const agentsHtml = agents.map((agent) => `
    <a href="/agents/${agent.name}.html" class="group relative flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/60 hover:border-zinc-700 transition-all duration-200">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3">
          <h3 class="font-semibold text-zinc-100 group-hover:text-white transition-colors">${agent.name}</h3>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-300 transition-colors">v${agent.version}</span>
        </div>
        <p class="text-sm text-zinc-500 mt-1 line-clamp-2 group-hover:text-zinc-400 transition-colors">${agent.description}</p>
        ${agent.mcp ? `<div class="mt-2 flex gap-2">${Object.keys(agent.mcp).map(m => `<span class="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20">${m}</span>`).join("")}</div>` : ""}
      </div>
      <div class="flex-shrink-0 ml-4">
        <div class="w-8 h-8 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300 transition-all duration-200 transform group-hover:translate-x-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    </a>
  `).join("");

  const content = `
    <!-- Hero Section -->
    <div class="mb-12">
      <h1 class="text-4xl font-bold mb-4 tracking-tight">Agents</h1>
      <p class="text-lg text-zinc-400 max-w-2xl leading-relaxed">
        Specialized agents that extend your AI coding assistant with new capabilities via MCP servers.
      </p>
      <div class="mt-6 flex items-center gap-4">
        <code class="flex items-center gap-2 text-sm bg-zinc-900 px-4 py-2.5 rounded-lg border border-zinc-800 font-mono text-zinc-300">
          <span class="text-zinc-500">$</span> bunx skz agent &lt;agent-name&gt;
        </code>
      </div>
    </div>
    
    <!-- Agents Grid -->
    <div class="grid gap-3 max-w-4xl">
      ${agentsHtml}
    </div>
  `;

  return baseTemplate("Agents", content, undefined, "agents");
}

function agentPage(agent: RegistryAgent, content: string): string {
  const installCmd = `bunx skz agent ${agent.name}`;

  // MCP servers
  let mcpHtml = "";
  if (agent.mcp && Object.keys(agent.mcp).length > 0) {
    const mcpList = Object.entries(agent.mcp)
      .map(([name, config]) => {
        const cfg = config as { type: string; url?: string };
        const urlPart = cfg.url ? ` <span class="text-zinc-500">(remote: ${cfg.url})</span>` : "";
        return `<li><span class="font-mono text-purple-400">${name}</span>${urlPart}</li>`;
      })
      .join("");
    mcpHtml = `
      <div class="mb-10 p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
        <h3 class="text-sm font-medium text-zinc-300 mb-2">MCP Servers</h3>
        <ul class="text-sm text-zinc-400 space-y-1">${mcpList}</ul>
      </div>
    `;
  }

  const parsedContent = parseMarkdown(content);

  const pageContent = `
    <!-- Hero Section -->
    <div class="mb-10">
      <h1 class="text-5xl font-bold tracking-tight mb-4 text-white">
        ${agent.name}
      </h1>
      <p class="text-xl text-zinc-400 max-w-2xl leading-relaxed">
        ${agent.description}
      </p>
    </div>

    <!-- Install Command - Primary CTA -->
    <div class="mb-10">
      <div class="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-3">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        <span>Install agent</span>
      </div>
      <div class="group relative">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-purple-500 rounded-lg opacity-20 group-hover:opacity-40 transition-opacity duration-300"></div>
        <div class="relative flex items-center justify-between gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900/80 backdrop-blur">
          <code class="text-base text-zinc-200 font-mono">${installCmd}</code>
          <button
            onclick="navigator.clipboard.writeText('${installCmd}')"
            class="flex items-center gap-2 px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-all active:scale-95"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <span>Copy</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MCP Servers -->
    ${mcpHtml}

    <hr class="border-zinc-800 my-10">

    <!-- Documentation Content -->
    <div class="max-w-3xl">
      <div class="prose prose-invert max-w-none prose-headings:font-semibold prose-a:text-zinc-300 prose-a:underline hover:prose-a:text-white prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
        ${parsedContent}
      </div>
    </div>
  `;

  const breadcrumb = `<a href="/agents.html" class="hover:text-white transition-colors">Agents</a> <span class="mx-2 text-zinc-600">/</span> <span class="text-zinc-300">${agent.name}</span>`;

  return baseTemplate(agent.name, pageContent, breadcrumb, "agents");
}

function gettingStartedPage(): string {
  const content = `
    <div class="max-w-3xl">
      <!-- Hero -->
      <div class="mb-10">
        <h1 class="text-4xl font-bold mb-4 tracking-tight">Getting Started</h1>
        <p class="text-lg text-zinc-400 leading-relaxed">
          Install skills and agents for your AI coding assistant in minutes.
        </p>
      </div>

      <!-- Installation Section -->
      <section class="mb-12">
        <h2 class="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">Installation</h2>
        <p class="text-zinc-400 mb-4">Initialize skillz in your project:</p>
        <pre class="mb-4"><code class="language-bash">bunx skz init</code></pre>
        <p class="text-zinc-400 mt-4 mb-4">This creates a <code>.opencode/skz.json</code> config file and sets up the required directories.</p>
      </section>

      <!-- Adding Skills Section -->
      <section class="mb-12">
        <h2 class="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">Adding Skills</h2>
        <p class="text-zinc-400 mb-4">Browse available skills and add them to your project:</p>
        <pre class="mb-3"><code class="language-bash"># List all available skills
bunx skz list

# Add a specific skill
bunx skz add linear-issues-read

# Add all skills in a domain
bunx skz add linear</code></pre>
      </section>

      <!-- Adding Agents Section -->
      <section class="mb-12">
        <h2 class="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">Adding Agents</h2>
        <p class="text-zinc-400 mb-4">Agents provide specialized capabilities via MCP servers:</p>
        <pre class="mb-3"><code class="language-bash"># List available agents
bunx skz list --agents

# Add an agent
bunx skz agent docs</code></pre>
      </section>

      <!-- Using Skills Section -->
      <section class="mb-12">
        <h2 class="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">Using Skills</h2>
        <p class="text-zinc-400 mb-4">Once installed, skills add new commands that your AI agent can use. For example:</p>
        <pre class="mb-3"><code class="language-bash"># List Linear issues (via linear-issues-read skill)
bun .opencode/skill/linear-issues-read/list-issues.ts --team Engineering

# Run a code review (via code-review skill)  
/code-review</code></pre>
      </section>

      <!-- Supported Platforms Section -->
      <section class="mb-12">
        <h2 class="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">Supported Platforms</h2>
        <div class="grid gap-4 mt-4">
          <div class="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
            <h3 class="font-medium mb-2">OpenCode</h3>
            <p class="text-sm text-zinc-400">Full support. Skills are installed to <code>.opencode/skill/</code></p>
          </div>
          <div class="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
            <h3 class="font-medium mb-2">Claude Code</h3>
            <p class="text-sm text-zinc-400">Full support. Run <code>bunx skz init --claude</code> or init in a directory with <code>.claude/</code></p>
          </div>
        </div>
      </section>

      <!-- Requirements Section -->
      <section class="mb-12">
        <h2 class="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">Requirements</h2>
        <ul class="list-disc list-inside text-zinc-400 space-y-2">
          <li><a href="https://bun.sh" class="text-zinc-300 underline hover:text-white transition-colors">Bun</a> runtime (for running skill scripts)</li>
          <li>Node.js 18+ (optional, for npx compatibility)</li>
        </ul>
      </section>
    </div>
  `;

  return baseTemplate("Getting Started", content, undefined, "getting-started");
}

// ============================================================================
// Main Generator
// ============================================================================

const AGENTS_DIR = "agents";

export async function generateDocs(): Promise<void> {
  console.log("\nGenerating documentation...\n");

  // Read registry
  const registryFile = Bun.file(REGISTRY_FILE);
  if (!(await registryFile.exists())) {
    throw new Error("registry.json not found. Run build first.");
  }
  const registry = (await registryFile.json()) as Registry;

  // Create directories in docs
  const skillsDocsDir = join(DOCS_DIR, "skills");
  const agentsDocsDir = join(DOCS_DIR, "agents");
  await mkdir(skillsDocsDir, { recursive: true });
  await mkdir(agentsDocsDir, { recursive: true });

  // Generate index page (skills)
  const indexHtml = indexPage(registry);
  await Bun.write(join(DOCS_DIR, "index.html"), indexHtml);
  console.log("  Generated index.html");

  // Generate skill pages
  for (const skill of registry.skills) {
    const skillMdPath = join(SKILLS_DIR, skill.name, "SKILL.md");
    const skillMdFile = Bun.file(skillMdPath);

    let content = "";
    if (await skillMdFile.exists()) {
      content = await skillMdFile.text();
    }

    const skillHtml = skillPage(skill, content);
    await Bun.write(join(skillsDocsDir, `${skill.name}.html`), skillHtml);
    console.log(`  Generated skills/${skill.name}.html`);
  }

  // Generate agents page
  const agentsHtml = agentsPage(registry);
  await Bun.write(join(DOCS_DIR, "agents.html"), agentsHtml);
  console.log("  Generated agents.html");

  // Generate agent detail pages
  for (const agent of registry.agents) {
    const agentMdPath = join(AGENTS_DIR, agent.name, "agent.md");
    const agentMdFile = Bun.file(agentMdPath);

    let content = "";
    if (await agentMdFile.exists()) {
      content = await agentMdFile.text();
    }

    const agentHtml = agentPage(agent, content);
    await Bun.write(join(agentsDocsDir, `${agent.name}.html`), agentHtml);
    console.log(`  Generated agents/${agent.name}.html`);
  }

  // Generate getting started page
  const gettingStartedHtml = gettingStartedPage();
  await Bun.write(join(DOCS_DIR, "getting-started.html"), gettingStartedHtml);
  console.log("  Generated getting-started.html");

  const totalPages = registry.skills.length + registry.agents.length + 3; // +3 for index, agents, getting-started
  console.log(`\nGenerated ${totalPages} pages.\n`);
}

// Run if called directly
if (import.meta.main) {
  generateDocs().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
