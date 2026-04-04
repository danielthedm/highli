import type { CoreTool } from "ai";
import { getConfig } from "../config/defaults.js";
import {
  autoDetectMethod,
  type AccessMethod,
} from "./claude-mcp.js";

export interface Source {
  /** Display name (e.g., "GitHub") */
  name: string;
  /** Config key in HighliConfig (e.g., "github") */
  configKey: string;
  /** Env var that enables this source (e.g., "GITHUB_TOKEN"). Checked first. */
  envKey: string;
  /** One-line description for the system prompt */
  description: string;
  /** AI SDK tool definitions — each tool is self-contained with its execute fn */
  tools: Record<string, CoreTool>;
  /** Optional: return context string for system prompt (e.g., "GitHub username: ...") */
  getUserContext?: () => string;
  /** Optional: custom availability check (runs if envKey is not set). Return true if available. */
  isAvailable?: () => boolean;
}

/** Define a source. Just returns the object — exists for readability and type safety. */
export function defineSource(source: Source): Source {
  return source;
}

/** Resolve the effective access method for a source */
export function getSourceMethod(source: Source): AccessMethod {
  const config = getConfig();
  const sourceConfig = config[source.configKey as keyof typeof config] as any;
  const method: AccessMethod = sourceConfig?.method ?? "auto";
  if (method === "auto") {
    // Try standard detection first
    const detected = autoDetectMethod(source.name);
    if (detected !== "skip") return detected;
    // Fall back to the source's own availability check (e.g., Claude Code checks for history file)
    if (process.env[source.envKey] || source.isAvailable?.()) return "token";
    return "skip";
  }
  return method;
}

// ── Registry ────────────────────────────────────────────────────────
// To add a new source: create src/sources/yourSource.ts, then add one
// import line here. That's it.

import github from "./github.js";
import linear from "./linear.js";
import slack from "./slack.js";
import notion from "./notion.js";
import claudeLogs from "./claude-logs.js";

const allSources: Source[] = [github, linear, slack, notion, claudeLogs];

/** Get sources that are available (method is not 'skip') */
export function getActiveSources(): Source[] {
  return allSources.filter((s) => getSourceMethod(s) !== "skip");
}

/** Get names of active sources */
export function getActiveSourceNames(): string[] {
  return getActiveSources().map((s) => s.name);
}

/** Get all tools from active sources, merged into one object */
export function getActiveTools(): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  for (const source of getActiveSources()) {
    Object.assign(tools, source.tools);
  }
  return tools;
}

/** Get user context strings from active sources for the system prompt */
export function getSourceContext(): string {
  return getActiveSources()
    .map((s) => s.getUserContext?.())
    .filter(Boolean)
    .join("\n");
}

export { allSources };
