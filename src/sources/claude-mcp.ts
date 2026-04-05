import { execSync, spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Claude CLI detection ───────────────────────────────────────────

let _claudeAvailable: boolean | null = null;

export function isClaudeCliAvailable(): boolean {
  if (_claudeAvailable !== null) return _claudeAvailable;
  try {
    spawnSync("claude", ["--version"], { encoding: "utf-8", timeout: 5000 });
    _claudeAvailable = true;
  } catch {
    _claudeAvailable = false;
  }
  return _claudeAvailable;
}

// ── MCP server detection ───────────────────────────────────────────

let _mcpServersCache: Record<string, unknown> | null = null;

export function getClaudeMcpServers(): Record<string, unknown> {
  if (_mcpServersCache !== null) return _mcpServersCache;
  const servers: Record<string, unknown> = {};

  // Check global settings files for locally configured MCP servers
  const paths = [
    join(homedir(), ".claude", "settings.json"),
    join(homedir(), ".claude", "settings.local.json"),
  ];

  for (const p of paths) {
    try {
      if (!existsSync(p)) continue;
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (data.mcpServers) {
        Object.assign(servers, data.mcpServers);
      }
    } catch {}
  }

  // Also query `claude mcp list` to pick up claude.ai cloud integrations
  try {
    const result = spawnSync("claude", ["mcp", "list"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (result.stdout) {
      for (const line of result.stdout.split("\n")) {
        // Lines look like: "claude.ai Slack: https://... - ✓ Connected"
        const match = line.match(/^(.+?):/);
        if (match) {
          const name = match[1].trim();
          servers[name] = {};
        }
      }
    }
  } catch {}

  _mcpServersCache = servers;
  return servers;
}

const MCP_PATTERNS: Record<string, RegExp> = {
  github: /github/i,
  linear: /linear/i,
  slack: /slack/i,
  notion: /notion/i,
  figma: /figma/i,
};

export function hasClaudeMcpServer(sourceName: string): boolean {
  const pattern = MCP_PATTERNS[sourceName.toLowerCase()];
  if (!pattern) return false;
  const servers = getClaudeMcpServers();
  return Object.keys(servers).some((name) => pattern.test(name));
}

/** Check if Claude CLI + MCP is viable for a given source */
export function isClaudeMcpAvailable(sourceName: string): boolean {
  return isClaudeCliAvailable() && hasClaudeMcpServer(sourceName);
}

// ── Read-only MCP tool allowlist ───────────────────────────────────
// These are the only tools claudeMcpQuery is permitted to invoke.
// All are read-only — no writes, sends, or mutations.

const READ_ONLY_MCP_TOOLS = [
  // Notion — search and fetch only
  "mcp__claude_ai_Notion__notion-search",
  "mcp__claude_ai_Notion__notion-fetch",
  "mcp__claude_ai_Notion__notion-get-comments",
  "mcp__claude_ai_Notion__notion-get-teams",
  "mcp__claude_ai_Notion__notion-get-users",
  "mcp__claude_ai_Notion__notion-query-meeting-notes",
  // Linear — all get/list/search operations
  "mcp__claude_ai_Linear__get_attachment",
  "mcp__claude_ai_Linear__get_document",
  "mcp__claude_ai_Linear__get_initiative",
  "mcp__claude_ai_Linear__get_issue",
  "mcp__claude_ai_Linear__get_issue_status",
  "mcp__claude_ai_Linear__get_milestone",
  "mcp__claude_ai_Linear__get_project",
  "mcp__claude_ai_Linear__get_status_updates",
  "mcp__claude_ai_Linear__get_team",
  "mcp__claude_ai_Linear__get_user",
  "mcp__claude_ai_Linear__list_comments",
  "mcp__claude_ai_Linear__list_cycles",
  "mcp__claude_ai_Linear__list_documents",
  "mcp__claude_ai_Linear__list_initiatives",
  "mcp__claude_ai_Linear__list_issue_labels",
  "mcp__claude_ai_Linear__list_issue_statuses",
  "mcp__claude_ai_Linear__list_issues",
  "mcp__claude_ai_Linear__list_milestones",
  "mcp__claude_ai_Linear__list_project_labels",
  "mcp__claude_ai_Linear__list_projects",
  "mcp__claude_ai_Linear__list_teams",
  "mcp__claude_ai_Linear__list_users",
  "mcp__claude_ai_Linear__research",
  "mcp__claude_ai_Linear__search_documentation",
  "mcp__claude_ai_Linear__extract_images",
  // Slack — read and search only
  "mcp__claude_ai_Slack__slack_read_canvas",
  "mcp__claude_ai_Slack__slack_read_channel",
  "mcp__claude_ai_Slack__slack_read_thread",
  "mcp__claude_ai_Slack__slack_read_user_profile",
  "mcp__claude_ai_Slack__slack_search_channels",
  "mcp__claude_ai_Slack__slack_search_public",
  "mcp__claude_ai_Slack__slack_search_public_and_private",
  "mcp__claude_ai_Slack__slack_search_users",
];

// ── Query Claude via CLI ───────────────────────────────────────────

export function claudeMcpQuery(prompt: string): string {
  try {
    const result = spawnSync(
      "claude",
      [
        "-p", prompt,
        "--output-format", "text",
        "--allowedTools", READ_ONLY_MCP_TOOLS.join(","),
      ],
      {
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (result.error) throw result.error;
    return result.stdout.trim();
  } catch (error: any) {
    return `Error querying Claude: ${error.message}`;
  }
}

// ── Source access method types ──────────────────────────────────────

export type AccessMethod = "token" | "cli" | "claude-mcp" | "skip" | "auto";

export interface DetectedMethods {
  token: boolean;
  cli: boolean;
  claudeMcp: boolean;
}

// ── Detection per source ───────────────────────────────────────────

function checkGhCli(): boolean {
  try {
    const result = spawnSync("gh", ["auth", "status"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function detectMethodsForSource(sourceName: string): DetectedMethods {
  const name = sourceName.toLowerCase();

  switch (name) {
    case "github":
      return {
        token: !!process.env.GITHUB_TOKEN,
        cli: checkGhCli(),
        claudeMcp: isClaudeMcpAvailable("github"),
      };
    case "linear":
      return {
        token: !!process.env.LINEAR_API_KEY,
        cli: false,
        claudeMcp: isClaudeMcpAvailable("linear"),
      };
    case "slack":
      return {
        token: !!process.env.SLACK_TOKEN,
        cli: false,
        claudeMcp: isClaudeMcpAvailable("slack"),
      };
    case "notion":
      return {
        token: !!process.env.NOTION_TOKEN,
        cli: false,
        claudeMcp: isClaudeMcpAvailable("notion"),
      };
    case "claude code":
      return {
        token: false,
        cli: false,
        claudeMcp: false,
      };
    default:
      return { token: false, cli: false, claudeMcp: false };
  }
}

/** Pick the best available method, or 'skip' if nothing works */
export function autoDetectMethod(sourceName: string): AccessMethod {
  const detected = detectMethodsForSource(sourceName);
  if (detected.token) return "token";
  if (detected.cli) return "cli";
  if (detected.claudeMcp) return "claude-mcp";
  return "skip";
}
