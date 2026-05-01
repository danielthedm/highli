import type { CoreTool } from "ai";
import { getConfig } from "./config.js";
import { autoDetectMethod, type AccessMethod } from "./claude-mcp.js";
import type { Event } from "./types.js";

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
  /** Optional: return context string for system prompt */
  getUserContext?: () => string;
  /** Optional: custom availability check */
  isAvailable?: () => boolean;
  /**
   * Optional: bulk ingestion. Pulls every event in `[since, until]` for the
   * authenticated user and returns canonical events. Required for sources that
   * feed the local expansive doc.
   */
  ingest?(since: string, until: string): Promise<Event[]>;
}

export function defineSource(source: Source): Source {
  return source;
}

export function getSourceMethod(source: Source): AccessMethod {
  const config = getConfig();
  const sourceConfig = config[source.configKey as keyof typeof config] as any;
  const method: AccessMethod = sourceConfig?.method ?? "auto";
  if (method === "auto") {
    const detected = autoDetectMethod(source.name);
    if (detected !== "skip") return detected;
    if (process.env[source.envKey] || source.isAvailable?.()) return "token";
    return "skip";
  }
  return method;
}

export function filterActive(sources: Source[]): Source[] {
  return sources.filter((s) => getSourceMethod(s) !== "skip");
}

export function activeNames(sources: Source[]): string[] {
  return filterActive(sources).map((s) => s.name);
}

export function activeTools(sources: Source[]): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  for (const source of filterActive(sources)) {
    Object.assign(tools, source.tools);
  }
  return tools;
}

export function activeContext(sources: Source[]): string {
  return filterActive(sources)
    .map((s) => s.getUserContext?.())
    .filter(Boolean)
    .join("\n");
}
