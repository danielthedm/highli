import "dotenv/config";
import Conf from "conf";
import { configSchema, type HighliConfig } from "./schema.js";

const store = new Conf<HighliConfig>({
  projectName: "highli",
  schema: {
    ai: { type: "object" as const, default: {} },
    github: { type: "object" as const, default: {} },
    slack: { type: "object" as const, default: {} },
    linear: { type: "object" as const, default: {} },
    notion: { type: "object" as const, default: {} },
    claudeLogs: { type: "object" as const, default: {} },
  },
  defaults: {
    ai: {
      provider: (process.env.AI_PROVIDER as "anthropic" | "openai") ?? "anthropic",
      model: process.env.AI_MODEL ?? "claude-sonnet-4-20250514",
    },
    github: { method: "auto", orgs: [], repos: [] },
    slack: { method: "auto", defaultChannels: [] },
    linear: { method: "auto" },
    notion: { method: "auto", defaultDatabaseIds: [] },
    claudeLogs: { method: "auto" },
  },
});

export function getConfig(): HighliConfig {
  const raw = store.store;
  return configSchema.parse({
    ai: {
      provider: process.env.AI_PROVIDER ?? raw.ai?.provider ?? "anthropic",
      model: process.env.AI_MODEL ?? raw.ai?.model ?? "claude-sonnet-4-20250514",
    },
    github: raw.github,
    slack: raw.slack,
    linear: raw.linear,
    notion: raw.notion,
    claudeLogs: raw.claudeLogs,
  });
}

export function setConfig<K extends keyof HighliConfig>(
  key: K,
  value: HighliConfig[K],
): void {
  store.set(key, value);
}

// Source availability is now handled by src/sources/registry.ts
