import { z } from "zod";

const accessMethod = z
  .enum(["token", "cli", "claude-mcp", "skip", "auto"])
  .default("auto");

export const configSchema = z.object({
  ai: z.object({
    provider: z.enum(["anthropic", "openai"]).default("anthropic"),
    model: z.string().default("claude-sonnet-4-20250514"),
  }),
  github: z
    .object({
      method: accessMethod,
      username: z.string().optional(),
      orgs: z.array(z.string()).default([]),
      repos: z.array(z.string()).default([]),
    })
    .default({}),
  slack: z
    .object({
      method: accessMethod,
      userId: z.string().optional(),
      defaultChannels: z.array(z.string()).default([]),
    })
    .default({}),
  linear: z
    .object({
      method: accessMethod,
      teamId: z.string().optional(),
    })
    .default({}),
  notion: z
    .object({
      method: accessMethod,
      defaultDatabaseIds: z.array(z.string()).default([]),
    })
    .default({}),
  claudeLogs: z
    .object({
      method: z.enum(["auto", "skip"]).default("auto"),
    })
    .default({}),
});

export type HighliConfig = z.infer<typeof configSchema>;
export type AccessMethod = z.infer<typeof accessMethod>;
