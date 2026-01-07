/**
 * Linear API client and utilities
 * These utilities are copied to user projects and can be customized
 */

import { LinearClient } from "@linear/sdk";

let _client: LinearClient | null = null;

/**
 * Get or create the Linear client instance
 */
export function getClient(): LinearClient {
  if (_client) {
    return _client;
  }

  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    console.error("Error: LINEAR_API_KEY environment variable is required");
    console.error("Set it in your .env file or export it in your shell");
    process.exit(1);
  }

  _client = new LinearClient({ apiKey });
  return _client;
}

/**
 * Linear client wrapper with convenient methods
 */
export const linear = {
  get client() {
    return getClient();
  },
  // Issues
  issues: (...args: Parameters<LinearClient["issues"]>) =>
    getClient().issues(...args),
  issue: (...args: Parameters<LinearClient["issue"]>) =>
    getClient().issue(...args),
  searchIssues: (...args: Parameters<LinearClient["searchIssues"]>) =>
    getClient().searchIssues(...args),
  createIssue: (...args: Parameters<LinearClient["createIssue"]>) =>
    getClient().createIssue(...args),
  updateIssue: (...args: Parameters<LinearClient["updateIssue"]>) =>
    getClient().updateIssue(...args),
  // Projects
  projects: (...args: Parameters<LinearClient["projects"]>) =>
    getClient().projects(...args),
  project: (...args: Parameters<LinearClient["project"]>) =>
    getClient().project(...args),
  createProject: (...args: Parameters<LinearClient["createProject"]>) =>
    getClient().createProject(...args),
  updateProject: (...args: Parameters<LinearClient["updateProject"]>) =>
    getClient().updateProject(...args),
  // Project Milestones
  projectMilestones: (...args: Parameters<LinearClient["projectMilestones"]>) =>
    getClient().projectMilestones(...args),
  projectMilestone: (...args: Parameters<LinearClient["projectMilestone"]>) =>
    getClient().projectMilestone(...args),
  createProjectMilestone: (
    ...args: Parameters<LinearClient["createProjectMilestone"]>
  ) => getClient().createProjectMilestone(...args),
  updateProjectMilestone: (
    ...args: Parameters<LinearClient["updateProjectMilestone"]>
  ) => getClient().updateProjectMilestone(...args),
  // Other
  teams: (...args: Parameters<LinearClient["teams"]>) =>
    getClient().teams(...args),
  users: (...args: Parameters<LinearClient["users"]>) =>
    getClient().users(...args),
};

/**
 * Resolve a team name or ID to an ID
 * Accepts either a UUID or team name (case-insensitive)
 */
export async function resolveTeamId(input: string): Promise<string> {
  const normalized = input.trim();
  // If already a UUID, return as-is
  if (normalized.match(/^[0-9a-f-]{36}$/i)) {
    return normalized;
  }
  // Look up via API
  const teams = await linear.teams();
  const team = teams.nodes.find(
    (t) => t.name.toLowerCase() === normalized.toLowerCase()
  );
  if (team) return team.id;

  const validTeams = teams.nodes.map((t) => t.name).join(", ");
  throw new Error(`Unknown team: ${input}. Available teams: ${validTeams}`);
}

/**
 * Resolve a label name or ID to an ID
 * Accepts either a UUID or label name (case-insensitive)
 */
export async function resolveLabelId(input: string): Promise<string> {
  const normalized = input.trim();
  // If already a UUID, return as-is
  if (normalized.match(/^[0-9a-f-]{36}$/i)) {
    return normalized;
  }
  // Look up via API
  const labels = await linear.client.issueLabels();
  const label = labels.nodes.find(
    (l) => l.name.toLowerCase() === normalized.toLowerCase()
  );
  if (label) return label.id;

  const validLabels = labels.nodes.map((l) => l.name).join(", ");
  throw new Error(`Unknown label: ${input}. Available labels: ${validLabels}`);
}

/**
 * Resolve a user name or ID to an ID
 * Accepts either a UUID or user display name (case-insensitive)
 */
export async function resolveUserId(input: string): Promise<string> {
  const normalized = input.trim();
  // If already a UUID, return as-is
  if (normalized.match(/^[0-9a-f-]{36}$/i)) {
    return normalized;
  }
  // Look up via API
  const users = await linear.users();
  const user = users.nodes.find(
    (u) => u.name.toLowerCase() === normalized.toLowerCase()
  );
  if (user) return user.id;

  const validUsers = users.nodes.map((u) => u.name).join(", ");
  throw new Error(`Unknown user: ${input}. Available users: ${validUsers}`);
}
