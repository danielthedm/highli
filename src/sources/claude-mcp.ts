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

export function getClaudeMcpServers(): Record<string, unknown> {
  const servers: Record<string, unknown> = {};

  // Check global settings
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

  return servers;
}

const MCP_PATTERNS: Record<string, RegExp> = {
  github: /github/i,
  linear: /linear/i,
  slack: /slack/i,
  notion: /notion/i,
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

// ── Query Claude via CLI ───────────────────────────────────────────

export function claudeMcpQuery(prompt: string): string {
  try {
    const result = spawnSync(
      "claude",
      ["-p", prompt, "--output-format", "text"],
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
