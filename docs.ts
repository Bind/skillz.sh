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

function baseTemplate(title: string, content: string, breadcrumb?: string, activePage?: string): string {
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
    .join("\n        ");

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
  <div class="border-b border-zinc-800">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold hover:text-zinc-300">skillz.sh</a>
      <nav class="flex items-center gap-6 text-sm">
        ${navHtml}
      </nav>
    </div>
  </div>
  ${breadcrumb ? `<div class="border-b border-zinc-800 bg-zinc-900/50"><div class="max-w-6xl mx-auto px-6 py-2 text-sm text-zinc-500">${breadcrumb}</div></div>` : ""}
  <main class="max-w-6xl mx-auto px-6 py-8">
    ${content}
  </main>
  <footer class="border-t border-zinc-800 mt-16">
    <div class="max-w-6xl mx-auto px-6 py-8 text-sm text-zinc-500">
      <p>Built for <a href="https://opencode.ai" class="underline hover:text-white">OpenCode</a> and <a href="https://claude.ai" class="underline hover:text-white">Claude Code</a></p>
    </div>
  </footer>
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

  // Domain icons
  const domainIcons: Record<string, string> = {
    linear: "L",
    github: "G",
    browser: "B",
    database: "D",
    terminal: "T",
    docs: "D",
    other: "O",
  };

  const domainColors: Record<string, string> = {
    linear: "bg-indigo-500/20 text-indigo-400",
    github: "bg-zinc-500/20 text-zinc-400",
    browser: "bg-orange-500/20 text-orange-400",
    database: "bg-emerald-500/20 text-emerald-400",
    terminal: "bg-yellow-500/20 text-yellow-400",
    docs: "bg-blue-500/20 text-blue-400",
    other: "bg-zinc-500/20 text-zinc-400",
  };

  let skillsHtml = "";
  for (const domain of domains) {
    const skills = byDomain.get(domain)!;
    const icon = domainIcons[domain] ?? domain[0]?.toUpperCase() ?? "?";
    const colorClass = domainColors[domain] ?? domainColors.other;

    skillsHtml += `
      <div class="mb-12">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-8 h-8 rounded-md ${colorClass} flex items-center justify-center text-sm font-bold">${icon}</div>
          <h2 class="text-lg font-semibold capitalize">${domain}</h2>
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
      </div>
    `;
  }

  const content = `
    <div class="mb-12">
      <h1 class="text-4xl font-bold mb-4">Skills</h1>
      <p class="text-lg text-zinc-400 max-w-2xl">
        Installable capabilities for AI coding agents. Each skill adds new tools and workflows to your agent.
      </p>
      <div class="mt-6 flex items-center gap-4">
        <code class="text-sm bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">bunx skz add &lt;skill-name&gt;</code>
      </div>
    </div>
    ${skillsHtml}
  `;

  return baseTemplate("Skills", content, undefined, "skills");
}

function skillPage(skill: RegistrySkill, content: string): string {
  const domain = skill.domain ?? "other";

  // Metadata badges
  const badges: string[] = [];
  badges.push(`<span class="px-2 py-1 text-xs rounded-md bg-zinc-800 text-zinc-400">v${skill.version}</span>`);
  badges.push(`<span class="px-2 py-1 text-xs rounded-md bg-zinc-800 text-zinc-400 capitalize">${domain}</span>`);

  // Install command
  const installCmd = `bunx skz add ${skill.name}`;

  // Dependencies
  let depsHtml = "";
  if (skill.dependencies && Object.keys(skill.dependencies).length > 0) {
    const depsList = Object.entries(skill.dependencies)
      .map(([name, version]) => `<li><code>${name}</code> <span class="text-zinc-500">${version}</span></li>`)
      .join("");
    depsHtml = `
      <div class="mt-6 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
        <h3 class="text-sm font-medium text-zinc-300 mb-2">Dependencies</h3>
        <ul class="text-sm text-zinc-400 space-y-1">${depsList}</ul>
      </div>
    `;
  }

  // Required skills
  let requiresHtml = "";
  if (skill.requires && skill.requires.length > 0) {
    const reqList = skill.requires
      .map((r) => `<a href="/skills/${r}.html" class="text-zinc-300 underline hover:text-white">${r}</a>`)
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
      <div class="mt-6 p-4 rounded-lg border border-amber-900/50 bg-amber-950/20">
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
    <div class="flex flex-col lg:flex-row gap-8">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 mb-2">
          ${badges.join("")}
        </div>
        <h1 class="text-3xl font-bold mb-2">${skill.name}</h1>
        <p class="text-lg text-zinc-400 mb-6">${skill.description}</p>
        
        <div class="mb-8 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div class="flex items-center justify-between gap-4">
            <code class="text-sm text-zinc-300">${installCmd}</code>
            <button onclick="navigator.clipboard.writeText('${installCmd}')" class="text-xs px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">Copy</button>
          </div>
        </div>

        ${requiresHtml}
        ${envHtml}
        ${entryHtml}
        ${setupHtml}
        ${depsHtml}

        <div class="mt-8 prose prose-invert max-w-none">
          ${parsedContent}
        </div>
      </div>
    </div>
  `;

  const breadcrumb = `<a href="/" class="hover:text-white">Skills</a> <span class="mx-2">/</span> <span class="text-zinc-300">${skill.name}</span>`;

  return baseTemplate(skill.name, pageContent, breadcrumb, "skills");
}

function agentsPage(registry: Registry): string {
  const agents = registry.agents;

  const agentsHtml = agents.map((agent) => `
    <a href="/agents/${agent.name}.html" class="block p-4 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50 transition-colors">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="font-medium text-zinc-100">${agent.name}</h3>
            <span class="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">v${agent.version}</span>
          </div>
          <p class="text-sm text-zinc-500 mt-1 line-clamp-2">${agent.description}</p>
          ${agent.mcp ? `<div class="mt-2 flex gap-2">${Object.keys(agent.mcp).map(m => `<span class="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">${m}</span>`).join("")}</div>` : ""}
        </div>
        <svg class="w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </div>
    </a>
  `).join("");

  const content = `
    <div class="mb-12">
      <h1 class="text-4xl font-bold mb-4">Agents</h1>
      <p class="text-lg text-zinc-400 max-w-2xl">
        Specialized agents that extend your AI coding assistant with new capabilities via MCP servers.
      </p>
      <div class="mt-6 flex items-center gap-4">
        <code class="text-sm bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">bunx skz agent &lt;agent-name&gt;</code>
      </div>
    </div>
    <div class="grid gap-3">
      ${agentsHtml}
    </div>
  `;

  return baseTemplate("Agents", content, undefined, "agents");
}

function agentPage(agent: RegistryAgent, content: string): string {
  const installCmd = `bunx skz agent ${agent.name}`;

  // Demo video (hero style)
  let demoHtml = "";
  if (agent.demo) {
    demoHtml = `
      <div class="mb-8 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
        <video 
          src="/demos/${agent.name}.mp4" 
          autoplay 
          playsinline 
          loop 
          muted 
          preload="auto"
          class="w-full"
        ></video>
      </div>
    `;
  }

  // MCP servers
  let mcpHtml = "";
  if (agent.mcp && Object.keys(agent.mcp).length > 0) {
    const mcpList = Object.entries(agent.mcp)
      .map(([name, config]) => {
        const cfg = config as { type: string; url?: string };
        return `<li><code>${name}</code> <span class="text-zinc-500">(${cfg.type}${cfg.url ? `: ${cfg.url}` : ""})</span></li>`;
      })
      .join("");
    mcpHtml = `
      <div class="mt-6 p-4 rounded-lg border border-purple-900/50 bg-purple-950/20">
        <h3 class="text-sm font-medium text-purple-400 mb-2">MCP Servers</h3>
        <ul class="text-sm text-zinc-400 space-y-1">${mcpList}</ul>
      </div>
    `;
  }

  // Required skills
  let skillsHtml = "";
  if (agent.skills && agent.skills.length > 0) {
    const skillsList = agent.skills
      .map((s) => `<a href="/skills/${s}.html" class="text-zinc-300 underline hover:text-white">${s}</a>`)
      .join(", ");
    skillsHtml = `
      <div class="mt-4 text-sm text-zinc-500">
        <span class="text-zinc-400">Requires skills:</span> ${skillsList}
      </div>
    `;
  }

  const parsedContent = parseMarkdown(content);

  const pageContent = `
    <div class="flex flex-col lg:flex-row gap-8">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 mb-2">
          <span class="px-2 py-1 text-xs rounded-md bg-zinc-800 text-zinc-400">v${agent.version}</span>
          <span class="px-2 py-1 text-xs rounded-md bg-purple-500/20 text-purple-400">Agent</span>
        </div>
        <h1 class="text-3xl font-bold mb-2">${agent.name}</h1>
        <p class="text-lg text-zinc-400 mb-6">${agent.description}</p>
        
        ${demoHtml}

        <div class="mb-8 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div class="flex items-center justify-between gap-4">
            <code class="text-sm text-zinc-300">${installCmd}</code>
            <button onclick="navigator.clipboard.writeText('${installCmd}')" class="text-xs px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">Copy</button>
          </div>
        </div>

        ${skillsHtml}
        ${mcpHtml}

        <div class="mt-8 prose prose-invert max-w-none">
          ${parsedContent}
        </div>
      </div>
    </div>
  `;

  const breadcrumb = `<a href="/agents.html" class="hover:text-white">Agents</a> <span class="mx-2">/</span> <span class="text-zinc-300">${agent.name}</span>`;

  return baseTemplate(agent.name, pageContent, breadcrumb, "agents");
}

function gettingStartedPage(): string {
  const content = `
    <div class="max-w-3xl">
      <h1 class="text-4xl font-bold mb-4">Getting Started</h1>
      <p class="text-lg text-zinc-400 mb-8">
        Install skills and agents for your AI coding assistant in minutes.
      </p>

      <h2 class="text-xl font-semibold mt-8 mb-4 pb-2 border-b border-zinc-800">Installation</h2>
      <p class="text-zinc-400 mb-4">Initialize skillz in your project:</p>
      <pre><code class="language-bash">bunx skz init</code></pre>
      <p class="text-zinc-400 mt-4 mb-4">This creates a <code>.opencode/skz.json</code> config file and sets up the required directories.</p>

      <h2 class="text-xl font-semibold mt-8 mb-4 pb-2 border-b border-zinc-800">Adding Skills</h2>
      <p class="text-zinc-400 mb-4">Browse available skills and add them to your project:</p>
      <pre><code class="language-bash"># List all available skills
bunx skz list

# Add a specific skill
bunx skz add linear-issues-read

# Add all skills in a domain
bunx skz add linear</code></pre>

      <h2 class="text-xl font-semibold mt-8 mb-4 pb-2 border-b border-zinc-800">Adding Agents</h2>
      <p class="text-zinc-400 mb-4">Agents provide specialized capabilities via MCP servers:</p>
      <pre><code class="language-bash"># List available agents
bunx skz list --agents

# Add an agent
bunx skz agent docs</code></pre>

      <h2 class="text-xl font-semibold mt-8 mb-4 pb-2 border-b border-zinc-800">Using Skills</h2>
      <p class="text-zinc-400 mb-4">Once installed, skills add new commands that your AI agent can use. For example:</p>
      <pre><code class="language-bash"># List Linear issues (via linear-issues-read skill)
bun .opencode/skill/linear-issues-read/list-issues.ts --team Engineering

# Run a code review (via code-review skill)  
/code-review</code></pre>

      <h2 class="text-xl font-semibold mt-8 mb-4 pb-2 border-b border-zinc-800">Supported Platforms</h2>
      <div class="grid gap-4 mt-4">
        <div class="p-4 rounded-lg border border-zinc-800">
          <h3 class="font-medium mb-2">OpenCode</h3>
          <p class="text-sm text-zinc-400">Full support. Skills are installed to <code>.opencode/skill/</code></p>
        </div>
        <div class="p-4 rounded-lg border border-zinc-800">
          <h3 class="font-medium mb-2">Claude Code</h3>
          <p class="text-sm text-zinc-400">Full support. Run <code>bunx skz init --claude</code> or init in a directory with <code>.claude/</code></p>
        </div>
      </div>

      <h2 class="text-xl font-semibold mt-8 mb-4 pb-2 border-b border-zinc-800">Requirements</h2>
      <ul class="list-disc list-inside text-zinc-400 space-y-2">
        <li><a href="https://bun.sh" class="text-zinc-300 underline hover:text-white">Bun</a> runtime (for running skill scripts)</li>
        <li>Node.js 18+ (optional, for npx compatibility)</li>
      </ul>
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
