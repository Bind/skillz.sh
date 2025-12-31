import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
  type MouseEvent,
} from "@opentui/core";
import {
  getAgents,
  getInstalledSkills,
  updateAgentSkillPermissions,
  getAgentSkillPermissions,
  type Agent,
  type InstalledSkill,
  type AgentLocation,
} from "../lib/agent.ts";
import { readConfig, createDefaultConfig, writeConfig } from "../lib/config.ts";
import {
  fetchAllSkills,
  fetchSkillFiles,
  fetchSkillJson,
  fetchUtilFile,
  installSkillFiles,
  installUtil,
  updatePackageJson,
  utilExists,
  type SkillWithRegistry,
} from "../lib/registry.ts";
import { mkdir } from "node:fs/promises";
import { SKILLS_DIR } from "../types.ts";

// Theme colors - black-on-black
const COLORS = {
  bg: "#000000",
  panelBg: "#0a0a0a",
  panelBorder: "#262626",
  panelBorderFocused: "#525252",
  text: "#e5e5e5",
  textDim: "#737373",
  textDimmer: "#525252", // Darker color for uninstalled skills
  selectedBg: "#404040",
  selectedText: "#ffffff",
  focusedBg: "#1a1a1a",
  allowColor: "#22c55e",
  denyColor: "#ef4444",
  askColor: "#eab308",
  footerBg: "#0a0a0a",
  footerText: "#a3a3a3",
};

type PermissionValue = "allow" | "deny" | "ask";
type FocusedPanel = "agents" | "skills";

// Permission icons
const PERM_ICONS = {
  allow: "\u2713", // ✓
  deny: "\u2717",  // ✗
  ask: "?",
  none: "-",
};

interface AgentItem {
  name: string;
  agent: Agent | null; // null for "All Agents" option
  description: string;
}

interface SkillItem {
  name: string;
  installed: boolean;
  description: string;
  permission?: PermissionValue;
}

interface AppState {
  agentItems: AgentItem[];
  skillItems: SkillItem[];
  installedSkills: InstalledSkill[];
  registrySkills: SkillWithRegistry[];
  selectedAgentIndex: number;
  selectedSkillIndex: number;
  skillScrollOffset: number;
  showUninstalled: boolean;
  message: string;
  messageType: "info" | "success" | "error";
  focusedPanel: FocusedPanel;
}

let renderer: CliRenderer | null = null;
let currentLocation: AgentLocation = "project";

// UI Elements
let mainContainer: BoxRenderable | null = null;
let agentListBox: BoxRenderable | null = null;
let agentSelect: SelectRenderable | null = null;
let agentDetailBox: BoxRenderable | null = null;
let agentDetailContainer: BoxRenderable | null = null;
let agentDetailLines: TextRenderable[] = [];
let skillListBox: BoxRenderable | null = null;
let skillListContainer: BoxRenderable | null = null;
let skillTextLines: TextRenderable[] = [];
let skillHintText: TextRenderable | null = null;
let footerBox: BoxRenderable | null = null;
let footerText: TextRenderable | null = null;

const state: AppState = {
  agentItems: [],
  skillItems: [],
  installedSkills: [],
  registrySkills: [],
  selectedAgentIndex: 0,
  selectedSkillIndex: 0,
  skillScrollOffset: 0,
  showUninstalled: false,
  message: "Loading...",
  messageType: "info",
  focusedPanel: "agents",
};

// Max visible skill items (will be calculated based on container height)
let maxVisibleSkills = 20;



function getCurrentAgentItem(): AgentItem | null {
  return state.agentItems[state.selectedAgentIndex] ?? null;
}

function formatPermissionIcon(perm: PermissionValue | undefined): string {
  switch (perm) {
    case "allow":
      return PERM_ICONS.allow;
    case "deny":
      return PERM_ICONS.deny;
    case "ask":
      return PERM_ICONS.ask;
    default:
      return PERM_ICONS.none;
  }
}

function getSkillPermission(skillName: string): PermissionValue | undefined {
  const agentItem = getCurrentAgentItem();
  if (!agentItem?.agent) return undefined;
  
  const permissions = getAgentSkillPermissions(agentItem.agent);
  return permissions[skillName];
}

function buildSkillItems(): void {
  const items: SkillItem[] = [];
  const agentItem = getCurrentAgentItem();

  // Add wildcard patterns if viewing a specific agent
  if (agentItem?.agent) {
    const permissions = getAgentSkillPermissions(agentItem.agent);
    const wildcardPatterns = Object.entries(permissions).filter(([k]) => k.includes("*"));
    
    for (const [pattern, perm] of wildcardPatterns) {
      items.push({
        name: pattern,
        installed: true, // Treat wildcards as "installed" for coloring
        description: "Wildcard pattern",
        permission: perm,
      });
    }
  }
  
  // Add installed skills
  for (const skill of state.installedSkills) {
    items.push({
      name: skill.name,
      installed: true,
      description: skill.description ?? "",
      permission: getSkillPermission(skill.name),
    });
  }
  
  // Add uninstalled skills from registry if showing
  if (state.showUninstalled) {
    const installedNames = new Set(state.installedSkills.map((s) => s.name));
    for (const skill of state.registrySkills) {
      if (!installedNames.has(skill.name)) {
        items.push({
          name: skill.name,
          installed: false,
          description: skill.description,
          permission: getSkillPermission(skill.name),
        });
      }
    }
  }
  
  state.skillItems = items;
}

function updateAgentOptions(): void {
  if (!agentSelect) return;

  const options: SelectOption[] = state.agentItems.map((item) => ({
    name: item.name,
    description: item.description,
    value: item.name,
  }));

  agentSelect.options = options;
}

let agentDetailBoxes: BoxRenderable[] = [];

function renderAgentDetail(): void {
  if (!agentDetailContainer) return;

  // Clear existing elements
  for (const line of agentDetailLines) {
    line.destroy();
  }
  for (const box of agentDetailBoxes) {
    box.destroy();
  }
  agentDetailLines = [];
  agentDetailBoxes = [];

  const agentItem = getCurrentAgentItem();
  
  if (!agentItem) return;

  // Create two-column layout
  const rowContainer = new BoxRenderable(renderer!, {
    id: "agent-detail-row",
    width: "100%",
    height: "auto",
    flexDirection: "row",
    flexGrow: 1,
  });
  agentDetailContainer.add(rowContainer);
  agentDetailBoxes.push(rowContainer);

  // Left column - name and description
  const leftCol = new BoxRenderable(renderer!, {
    id: "agent-detail-left",
    width: "60%",
    height: "auto",
    flexDirection: "column",
    flexGrow: 0,
    flexShrink: 0,
  });
  rowContainer.add(leftCol);
  agentDetailBoxes.push(leftCol);

  // Right column - mode, model, temp
  const rightCol = new BoxRenderable(renderer!, {
    id: "agent-detail-right",
    width: "40%",
    height: "auto",
    flexDirection: "column",
    flexGrow: 0,
    flexShrink: 0,
  });
  rowContainer.add(rightCol);
  agentDetailBoxes.push(rightCol);

  // Helper to add a line to a container
  const addLine = (container: BoxRenderable, content: string, color: string = COLORS.text) => {
    const line = new TextRenderable(renderer!, {
      id: `agent-detail-${agentDetailLines.length}`,
      content,
      fg: color,
      height: 1,
    });
    container.add(line);
    agentDetailLines.push(line);
  };

  // Left column content
  addLine(leftCol, agentItem.name, COLORS.text);

  if (!agentItem.agent) {
    // Wildcard agent
    addLine(leftCol, "Permissions apply to all agents", COLORS.textDim);
    return;
  }

  const fm = agentItem.agent.frontmatter;

  // Description
  if (fm.description) {
    addLine(leftCol, fm.description, COLORS.textDim);
  }

  // Right column content
  addLine(rightCol, `mode: ${fm.mode ?? "default"}`, COLORS.textDim);
  addLine(rightCol, `model: ${fm.model ?? "default"}`, COLORS.textDim);
  addLine(rightCol, `temperature: ${fm.temperature ?? "default"}`, COLORS.textDim);

  // Max Steps (if set)
  if (fm.maxSteps !== undefined) {
    addLine(rightCol, `maxSteps: ${fm.maxSteps}`, COLORS.textDim);
  }

  // Disabled
  if (fm.disable) {
    addLine(rightCol, "Status: disabled", COLORS.denyColor);
  }
}

function ensureSkillVisible(): void {
  if (state.selectedSkillIndex < state.skillScrollOffset) {
    state.skillScrollOffset = state.selectedSkillIndex;
  } else if (state.selectedSkillIndex >= state.skillScrollOffset + maxVisibleSkills) {
    state.skillScrollOffset = state.selectedSkillIndex - maxVisibleSkills + 1;
  }
}

let skillLineBoxes: BoxRenderable[] = [];

function renderSkillList(): void {
  if (!skillListContainer) return;

  buildSkillItems();

  // Clear existing elements
  for (const line of skillTextLines) {
    line.destroy();
  }
  for (const box of skillLineBoxes) {
    box.destroy();
  }
  skillTextLines = [];
  skillLineBoxes = [];

  // Calculate visible range
  const startIdx = state.skillScrollOffset;
  const endIdx = Math.min(startIdx + maxVisibleSkills, state.skillItems.length);

  for (let i = startIdx; i < endIdx; i++) {
    const item = state.skillItems[i]!;
    const isSelected = i === state.selectedSkillIndex;
    const isFocused = state.focusedPanel === "skills";
    const permIcon = formatPermissionIcon(item.permission);
    const installedMark = item.installed ? "" : " (not installed)";
    
    // Determine colors based on installed status and selection
    let textColor: string;
    let bgColor: string;
    let descColor: string;

    if (isSelected && isFocused) {
      // Focused and selected - bright highlight
      textColor = COLORS.selectedText;
      bgColor = COLORS.selectedBg;
      descColor = COLORS.selectedText;
    } else if (isSelected) {
      // Selected but not focused - dim highlight
      textColor = COLORS.text;
      bgColor = COLORS.focusedBg;
      descColor = COLORS.textDim;
    } else if (item.installed) {
      textColor = COLORS.text;
      bgColor = COLORS.panelBg;
      descColor = COLORS.textDim;
    } else {
      // Uninstalled - use dimmer colors
      textColor = COLORS.textDimmer;
      bgColor = COLORS.panelBg;
      descColor = COLORS.textDimmer;
    }

    // Create container box for each skill item (for background color)
    const itemBox = new BoxRenderable(renderer!, {
      id: `skill-item-box-${i}`,
      width: "100%",
      height: 2, // 2 lines: name + description
      backgroundColor: bgColor,
      flexGrow: 0,
      flexShrink: 0,
      flexDirection: "column",
    });
    skillListContainer.add(itemBox);
    skillLineBoxes.push(itemBox);

    // Create name line
    const pointer = isSelected ? "\u25B6 " : "  "; // ▶ or space
    const nameLine = new TextRenderable(renderer!, {
      id: `skill-name-${i}`,
      content: `${pointer}[${permIcon}] ${item.name}${installedMark}`,
      fg: textColor,
    });
    itemBox.add(nameLine);
    skillTextLines.push(nameLine);

    // Create description line (indented to align with skill name after "▶ [x] ")
    const descLine = new TextRenderable(renderer!, {
      id: `skill-desc-${i}`,
      content: `      ${item.description}`,
      fg: descColor,
    });
    itemBox.add(descLine);
    skillTextLines.push(descLine);
  }

  // Show scroll indicator if needed
  if (state.skillItems.length > maxVisibleSkills) {
    const scrollInfo = ` [${state.skillScrollOffset + 1}-${endIdx}/${state.skillItems.length}]`;
    const scrollLine = new TextRenderable(renderer!, {
      id: "skill-scroll-info",
      content: scrollInfo,
      fg: COLORS.textDim,
    });
    skillListContainer.add(scrollLine);
    skillTextLines.push(scrollLine);
  }
}

function updatePanelBorders(): void {
  if (agentListBox) {
    agentListBox.borderColor = state.focusedPanel === "agents" ? COLORS.panelBorderFocused : COLORS.panelBorder;
  }
}

function updateFooter(): void {
  if (!footerText) return;

  const parts: string[] = [];

  if (state.focusedPanel === "agents") {
    parts.push(
      "j/k: navigate",
      "l/Enter: select",
      state.showUninstalled ? "u: hide uninstalled" : "u: show uninstalled",
      "q: quit"
    );
  } else {
    parts.push(
      "h: back",
      "j/k: navigate",
      `a: ${PERM_ICONS.allow} allow`,
      `d: ${PERM_ICONS.deny} deny`,
      `s: ${PERM_ICONS.ask} ask`,
      "q: quit"
    );
  }

  footerText.content = ` ${parts.join("  |  ")}`;
}

function updateSkillHint(): void {
  if (!skillHintText) return;
  
  skillHintText.content = "Press 'u' to toggle uninstalled.";
}

function getSelectedSkillName(): string | null {
  const item = state.skillItems[state.selectedSkillIndex];
  return item?.name ?? null;
}

async function installSkill(skill: SkillWithRegistry): Promise<boolean> {
  try {
    let config = await readConfig();
    if (!config) {
      config = createDefaultConfig();
      await writeConfig(config);
      await mkdir(SKILLS_DIR, { recursive: true });
      await mkdir(config.utils, { recursive: true });
    }

    const skillJson = await fetchSkillJson(skill.registry, skill.name);

    if (skillJson?.utils) {
      for (const utilName of skillJson.utils) {
        const utilPath = `${utilName}.ts`;
        const exists = await utilExists(config.utils, utilPath);
        if (!exists) {
          try {
            const content = await fetchUtilFile(skill.registry, utilPath);
            await installUtil(config.utils, utilPath, content);
          } catch {
            // Skip util errors
          }
        }
      }
    }

    if (skillJson?.dependencies) {
      await updatePackageJson(skillJson.dependencies);
    }

    const files = await fetchSkillFiles(skill.registry, skill.name);
    await installSkillFiles(skill.name, files);

    return true;
  } catch {
    return false;
  }
}

async function setPermissionForSelected(permission: PermissionValue): Promise<void> {
  const agentItem = getCurrentAgentItem();
  const skillName = getSelectedSkillName();
  
  if (!agentItem?.agent) {
    return;
  }
  
  if (!skillName) {
    return;
  }

  const installedNames = new Set(state.installedSkills.map((s) => s.name));
  const isUninstalled = !installedNames.has(skillName) && !skillName.includes("*");
  
  if (isUninstalled) {
    const registrySkill = state.registrySkills.find((s) => s.name === skillName);
    if (registrySkill) {
      const success = await installSkill(registrySkill);
      
      if (success) {
        state.installedSkills = await getInstalledSkills();
      } else {
        return;
      }
    }
  }

  try {
    await updateAgentSkillPermissions(agentItem.agent.name, {
      [skillName]: permission,
    });

    await reloadAgents();
    renderSkillList();
    
    const installMsg = isUninstalled ? " (installed)" : "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
  }
}

async function reloadAgents(): Promise<void> {
  const agents = await getAgents(currentLocation);
  
  state.agentItems = [
    ...agents.map((agent) => ({
      name: agent.name,
      agent,
      description: agent.frontmatter.description ?? "No description",
    })),
    { name: "*", agent: null, description: "Set permissions for all agents" },
  ];
  
  updateAgentOptions();
  renderAgentDetail();
}

function switchToSkillsPanel(): void {
  state.focusedPanel = "skills";
  state.selectedSkillIndex = 0;
  state.skillScrollOffset = 0;
  agentSelect?.blur();
  updatePanelBorders();
  renderSkillList();
  updateFooter();
}

function switchToAgentsPanel(): void {
  state.focusedPanel = "agents";
  agentSelect?.focus();
  updatePanelBorders();
  renderSkillList();
  updateFooter();
}

function moveSkillSelection(delta: number): void {
  const newIndex = state.selectedSkillIndex + delta;
  if (newIndex >= 0 && newIndex < state.skillItems.length) {
    state.selectedSkillIndex = newIndex;
    ensureSkillVisible();
    renderSkillList();
  }
}

function handleAgentSelectionChange(index: number): void {
  state.selectedAgentIndex = index;
  state.selectedSkillIndex = 0;
  state.skillScrollOffset = 0;
  renderAgentDetail();
  renderSkillList();
  updateFooter();
}

function toggleShowUninstalled(): void {
  state.showUninstalled = !state.showUninstalled;
  state.selectedSkillIndex = 0;
  state.skillScrollOffset = 0;
  renderSkillList();
  updateFooter();
  updateSkillHint();
}

function handleKeyPress(key: KeyEvent): void {
  // Global keys
  if (key.name === "q" || key.name === "escape") {
    cleanup();
    process.exit(0);
  }

  if (key.name === "u") {
    toggleShowUninstalled();
    return;
  }

  // Panel-specific keys
  if (state.focusedPanel === "agents") {
    if (key.name === "l" || key.name === "return" || key.name === "linefeed") {
      switchToSkillsPanel();
      return;
    }
    // j/k handled by SelectRenderable
  } else {
    // Skills panel - handle navigation ourselves
    if (key.name === "h") {
      switchToAgentsPanel();
      return;
    }

    if (key.name === "j" || key.name === "down") {
      moveSkillSelection(1);
      return;
    }

    if (key.name === "k" || key.name === "up") {
      moveSkillSelection(-1);
      return;
    }

    if (key.name === "a") {
      setPermissionForSelected("allow");
      return;
    }

    if (key.name === "d") {
      setPermissionForSelected("deny");
      return;
    }

    if (key.name === "s") {
      setPermissionForSelected("ask");
      return;
    }
  }
}

function createUI(rendererInstance: CliRenderer): void {
  renderer = rendererInstance;
  renderer.setBackgroundColor(COLORS.bg);

  // Top spacer
  const topSpacer = new BoxRenderable(renderer, {
    id: "top-spacer",
    width: "100%",
    height: 1,
    flexGrow: 0,
    flexShrink: 0,
  });

  // Main container (horizontal split)
  mainContainer = new BoxRenderable(renderer, {
    id: "main-container",
    width: "100%",
    height: "auto",
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
  });

  // Left panel - Agent list
  const leftPanel = new BoxRenderable(renderer, {
    id: "left-panel",
    width: "30%",
    height: "100%",
    flexDirection: "column",
    flexGrow: 0,
    flexShrink: 0,
  });

  agentListBox = new BoxRenderable(renderer, {
    id: "agent-list-box",
    width: "100%",
    height: "auto",
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: COLORS.panelBg,
    borderStyle: "single",
    borderColor: COLORS.panelBorderFocused,
    border: true,
    title: " Agents ",
    titleAlignment: "left",
    onMouseDown: () => {
      if (state.focusedPanel !== "agents") {
        switchToAgentsPanel();
      }
    },
  });

  agentSelect = new SelectRenderable(renderer, {
    id: "agent-select",
    width: "100%",
    height: "auto",
    flexGrow: 1,
    flexShrink: 1,
    options: [],
    backgroundColor: COLORS.panelBg,
    focusedBackgroundColor: COLORS.panelBg, // Same as background for clean look
    textColor: COLORS.text,
    focusedTextColor: COLORS.text,
    selectedBackgroundColor: COLORS.selectedBg,
    selectedTextColor: COLORS.selectedText,
    showScrollIndicator: true,
    wrapSelection: true,
    showDescription: false,
  });

  agentSelect.on(SelectRenderableEvents.SELECTION_CHANGED, handleAgentSelectionChange);
  agentListBox.add(agentSelect);

  leftPanel.add(agentListBox);

  // Right panel - vertical stack with agent detail and skills
  const rightPanel = new BoxRenderable(renderer, {
    id: "right-panel",
    width: "70%",
    height: "100%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
  });

  // Agent detail panel (no border, just laid out info)
  agentDetailBox = new BoxRenderable(renderer, {
    id: "agent-detail-box",
    width: "100%",
    height: 5, // Compact height for detail section
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: COLORS.panelBg,
    paddingLeft: 1,
  });

  agentDetailContainer = new BoxRenderable(renderer, {
    id: "agent-detail-container",
    width: "100%",
    height: "auto",
    flexDirection: "column",
    backgroundColor: COLORS.panelBg,
  });

  agentDetailBox.add(agentDetailContainer);

  // Skills title
  const skillsTitle = new TextRenderable(renderer, {
    id: "skills-title",
    content: "Skills",
    fg: COLORS.textDim,
    height: 1,
  });

  // Skills list panel (no border)
  skillListBox = new BoxRenderable(renderer, {
    id: "skill-list-box",
    width: "100%",
    height: "auto",
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "column",
    backgroundColor: COLORS.panelBg,
    paddingLeft: 1,
    onMouseDown: () => {
      if (state.focusedPanel !== "skills") {
        switchToSkillsPanel();
      }
    },
  });

  skillListBox.add(skillsTitle);

  skillListContainer = new BoxRenderable(renderer, {
    id: "skill-list-container",
    width: "100%",
    height: "auto",
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "column",
    backgroundColor: COLORS.panelBg,
  });

  skillListBox.add(skillListContainer);

  // Hint text at bottom right of skills pane
  const skillHintBox = new BoxRenderable(renderer, {
    id: "skill-hint-box",
    width: "100%",
    height: 1,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingRight: 1,
  });
  skillHintText = new TextRenderable(renderer, {
    id: "skill-hint-text",
    content: "",
    fg: COLORS.textDim,
  });
  skillHintBox.add(skillHintText);
  skillListBox.add(skillHintBox);

  rightPanel.add(agentDetailBox);
  rightPanel.add(skillListBox);

  mainContainer.add(leftPanel);
  mainContainer.add(rightPanel);

  // Footer with keybindings
  footerBox = new BoxRenderable(renderer, {
    id: "footer-box",
    width: "100%",
    height: 3,
    backgroundColor: COLORS.footerBg,
    borderStyle: "single",
    borderColor: COLORS.panelBorder,
    border: true,
    flexGrow: 0,
    flexShrink: 0,
  });

  footerText = new TextRenderable(renderer, {
    id: "footer-text",
    content: " Loading...",
    fg: COLORS.footerText,
  });

  footerBox.add(footerText);

  // Add to root
  renderer.root.add(topSpacer);
  renderer.root.add(mainContainer);
  renderer.root.add(footerBox);

  // Focus agents panel first
  agentSelect.focus();

  // Set up key handler
  renderer.keyInput.on("keypress", handleKeyPress);
}

async function loadData(): Promise<void> {
  const locationLabel = currentLocation === "global" ? "global" : "project";

  // Load agents
  const agents = await getAgents(currentLocation);
  
  state.agentItems = [
    ...agents.map((agent) => ({
      name: agent.name,
      agent,
      description: agent.frontmatter.description ?? "No description",
    })),
    { name: "*", agent: null, description: "Set permissions for all agents" },
  ];

  // Load installed skills
  state.installedSkills = await getInstalledSkills();

  // Load registry skills for "show uninstalled" feature
  try {
    const config = await readConfig();
    const registries = config?.registries ?? ["github:Bind/skillz.sh"];
    state.registrySkills = await fetchAllSkills(registries);
  } catch {
    // Ignore registry fetch errors
  }

  updateAgentOptions();
  renderAgentDetail();
  renderSkillList();
  updateFooter();
  updateSkillHint();
}

function cleanup(): void {
  if (renderer) {
    renderer.keyInput.off("keypress", handleKeyPress);
    for (const line of skillTextLines) {
      line.destroy();
    }
    for (const box of skillLineBoxes) {
      box.destroy();
    }
    for (const line of agentDetailLines) {
      line.destroy();
    }
    for (const box of agentDetailBoxes) {
      box.destroy();
    }
    if (agentSelect) agentSelect.destroy();
    renderer.destroy();
  }

  renderer = null;
  mainContainer = null;
  agentListBox = null;
  agentSelect = null;
  agentDetailBox = null;
  agentDetailContainer = null;
  agentDetailLines = [];
  agentDetailBoxes = [];
  skillListBox = null;
  skillListContainer = null;
  skillTextLines = [];
  skillLineBoxes = [];
  skillHintText = null;
  footerBox = null;
  footerText = null;
}

export async function runAgentsTui(global: boolean = false): Promise<void> {
  currentLocation = global ? "global" : "project";

  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: true,
      targetFps: 30,
    });

    createUI(renderer);
    await loadData();
    renderer.start();
  } catch (error) {
    cleanup();
    throw error;
  }
}
