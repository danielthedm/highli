import type { CoreTool } from "ai";

export interface Source {
  /** Display name (e.g., "GitHub") */
  name: string;
  /** Env var that must be set to enable this source (e.g., "GITHUB_TOKEN") */
  envKey: string;
  /** One-line description for the system prompt */
  description: string;
  /** AI SDK tool definitions — each tool is self-contained with its execute fn */
  tools: Record<string, CoreTool>;
  /** Optional: return context string for system prompt (e.g., "GitHub username: ...") */
  getUserContext?: () => string;
}

/** Define a source. Just returns the object — exists for readability and type safety. */
export function defineSource(source: Source): Source {
  return source;
}

// ── Registry ────────────────────────────────────────────────────────
// To add a new source: create src/sources/yourSource.ts, then add one
// import line here. That's it.

import github from "./github.js";
import linear from "./linear.js";
import slack from "./slack.js";
import notion from "./notion.js";

const allSources: Source[] = [github, linear, slack, notion];

/** Get sources that have their env var set */
export function getActiveSources(): Source[] {
  return allSources.filter((s) => process.env[s.envKey]);
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
