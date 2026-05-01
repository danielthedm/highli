import type { Event } from "@highli/core/types";

export type DisplayEvent = Pick<
  Event,
  "id" | "source" | "type" | "ts" | "title" | "summary" | "url"
>;
