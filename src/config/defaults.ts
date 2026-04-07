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
    jira: { type: "object" as const, default: {} },
    confluence: { type: "object" as const, default: {} },
    gitlab: { type: "object" as const, default: {} },
    bitbucket: { type: "object" as const, default: {} },
    asana: { type: "object" as const, default: {} },
    googleDocs: { type: "object" as const, default: {} },
    pagerduty: { type: "object" as const, default: {} },
    datadog: { type: "object" as const, default: {} },
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
    jira: { method: "auto" },
    confluence: { method: "auto" },
    gitlab: { method: "auto" },
    bitbucket: { method: "auto" },
    asana: { method: "auto" },
    googleDocs: { method: "auto" },
    pagerduty: { method: "auto" },
    datadog: { method: "auto" },
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
    jira: raw.jira,
    confluence: raw.confluence,
    gitlab: raw.gitlab,
    bitbucket: raw.bitbucket,
    asana: raw.asana,
    googleDocs: raw.googleDocs,
    pagerduty: raw.pagerduty,
    datadog: raw.datadog,
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
