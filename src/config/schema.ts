import { z } from "zod";

export const configSchema = z.object({
  ai: z.object({
    provider: z.enum(["anthropic", "openai"]).default("anthropic"),
    model: z.string().default("claude-sonnet-4-20250514"),
  }),
  github: z
    .object({
      username: z.string().optional(),
      orgs: z.array(z.string()).default([]),
      repos: z.array(z.string()).default([]),
    })
    .default({}),
  slack: z
    .object({
      userId: z.string().optional(),
      defaultChannels: z.array(z.string()).default([]),
    })
    .default({}),
  linear: z
    .object({
      teamId: z.string().optional(),
    })
    .default({}),
  notion: z
    .object({
      defaultDatabaseIds: z.array(z.string()).default([]),
    })
    .default({}),
});

export type HighliConfig = z.infer<typeof configSchema>;
