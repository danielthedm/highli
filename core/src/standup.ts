import type { Event } from "./types.js";

export interface StandupEvent {
  id: string;
  source: string;
  type: string;
  ts: number | string | Date;
  title: string;
  summary?: string | null;
  url?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface StandupRange {
  since: string;
  until: string;
  label: string;
  startMs: number;
  endMs: number;
}

export interface StandupSummary {
  date: string;
  label: string;
  eventCount: number;
  bullets: string[];
  markdown: string;
}

export function getYesterdayRange(anchor = new Date()): StandupRange {
  const yesterday = new Date(anchor);
  yesterday.setDate(yesterday.getDate() - 1);
  const date = toLocalDate(yesterday);
  return getStandupRangeForDate(date, "Yesterday");
}

export function getStandupRangeForDate(date: string, label = date): StandupRange {
  const start = startOfLocalDate(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    since: date,
    until: date,
    label,
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

export function getStandupLookupRange(
  range: StandupRange,
): Pick<StandupRange, "since" | "until"> {
  const paddedStart = new Date(range.startMs);
  paddedStart.setDate(paddedStart.getDate() - 1);
  const paddedEnd = new Date(range.endMs);
  return {
    since: toLocalDate(paddedStart),
    until: toLocalDate(paddedEnd),
  };
}

export function filterStandupEvents<T extends Event | StandupEvent>(
  events: T[],
  range: StandupRange,
): T[] {
  return events.filter((event) => isStandupEventInRange(event, range));
}

export function isStandupEventInRange(
  event: Event | StandupEvent,
  range: StandupRange,
): boolean {
  const ms = toMs(event.ts);
  return Number.isFinite(ms) && ms >= range.startMs && ms < range.endMs;
}

export function buildStandupSummary(
  events: Array<Event | StandupEvent>,
  range: StandupRange = getYesterdayRange(),
): StandupSummary {
  const sorted = [...events].sort((a, b) => toMs(a.ts) - toMs(b.ts));
  const bullets = sorted.slice(0, 8).map(formatStandupBullet);
  const remaining = Math.max(0, sorted.length - bullets.length);

  if (remaining > 0) {
    bullets.push(
      `Captured ${remaining} more ${remaining === 1 ? "event" : "events"} in the raw timeline.`,
    );
  }

  const markdown =
    bullets.length > 0
      ? [`${range.label}:`, ...bullets.map((bullet) => `- ${bullet}`)].join("\n")
      : `${range.label}:\n- No captured work events for ${range.since}.`;

  return {
    date: range.since,
    label: range.label,
    eventCount: sorted.length,
    bullets,
    markdown,
  };
}

function formatStandupBullet(event: Event | StandupEvent): string {
  const title = event.title.replace(/\s+/g, " ").trim();
  const summary = event.summary?.replace(/\s+/g, " ").trim();
  const prefix = prefixFor(event);
  const detail = summary && !title.includes(summary) ? ` - ${summary}` : "";
  return `${prefix}: ${title}${detail}`;
}

function prefixFor(event: Event | StandupEvent): string {
  const type = event.type.toLowerCase();
  const source = event.source.toLowerCase();
  if (type.includes("review")) return "Reviewed";
  if (type.includes("pr")) return "Worked on PR";
  if (type.includes("commit")) return "Committed";
  if (type.includes("issue")) return "Moved issue";
  if (type.includes("deploy")) return "Deployed";
  if (source === "linear") return "Moved Linear work";
  if (source === "github") return "Worked in GitHub";
  return `Captured ${event.source}`;
}

function toMs(value: number | string | Date): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}
