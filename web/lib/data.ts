import "server-only";
import { createHash } from "crypto";
import {
  aiCacheGet,
  aiCacheSet,
  aiCached,
  eventsBetween,
  getCurrentGoal,
  listArchives,
  listManualGroups,
  listStars,
  type CareerGoal,
  type ManualGroup,
} from "@highli/core/db";
import type { Event } from "@highli/core/types";
import type { DisplayEvent } from "@/lib/display-event";
import {
  getLastRecapVisitAt,
  getRecapAiWindow,
  recordRecapAiWindow,
  type RecapAiWindow,
} from "@/lib/recap-visit";
import {
  generateForgottenInsight,
  generateGrouping,
  generateWeeklyHighlights,
  type EventGroup,
  type Insight,
  type WeeklyHighlight,
} from "@highli/core/ai";
import {
  buildStandupSummary,
  filterStandupEvents,
  getStandupLookupRange,
  getYesterdayRange,
  type StandupSummary,
} from "@highli/core/standup";

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number, anchor: Date = new Date()): string {
  const d = new Date(anchor);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function isoToday(anchor: Date = new Date()): string {
  return anchor.toISOString().split("T")[0];
}

export interface HomeData {
  goal: string | null;
  goalRecord: CareerGoal | null;
  thisWeekEvents: DisplayEvent[];
  timelineEvents: DisplayEvent[];
  highlights: WeeklyHighlight[];
  insight: Insight | null;
  /** Ephemeral AI groupings — recomputed each consolidation pass. */
  aiGroups: EventGroup[];
  /** Engineer-confirmed groupings — persistent. */
  manualGroups: ManualGroup[];
  starredIds: Set<string>;
  archivedIds: Set<string>;
}

export interface HomeBaseData {
  goal: string | null;
  goalRecord: CareerGoal | null;
  thisWeekEvents: DisplayEvent[];
  timelineEvents: DisplayEvent[];
  manualGroups: ManualGroup[];
  starredIds: Set<string>;
  archivedIds: Set<string>;
  consolidatedThisWeek: Event[];
  consolidatedTimeline: Event[];
  manualMemberIds: Set<string>;
  weekSince: string;
  recapMode: "weekly" | "since-last-visit";
  lastRecapVisitAt: number | null;
  recapSourceVisitAt: number | null;
  recapWindowKey: string;
  timelineSince: string;
  until: string;
  goalFp: string;
  starFp: string;
  archiveFp: string;
  manualFp: string;
}

export interface WeeklyAiData {
  highlights: WeeklyHighlight[];
  insight: Insight | null;
}

export interface TimelineAiData {
  aiGroups: EventGroup[];
}

async function aiCachedWithStatus<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ value: T; refreshed: boolean }> {
  const hit = aiCacheGet<T>(key);
  if (hit !== null) return { value: hit, refreshed: false };

  const fresh = await fn();
  aiCacheSet(key, fresh, ttlMs);
  return { value: fresh, refreshed: true };
}

function compactEvents(events: Event[]): DisplayEvent[] {
  return events.map(({ id, source, type, ts, title, summary, url }) => ({
    id,
    source,
    type,
    ts,
    title,
    summary,
    url,
  }));
}

function fingerprint(value: unknown): string {
  return createHash("sha1")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 12);
}

function isoDateFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

function freshRecapAiWindow(window: RecapAiWindow | null, now: Date): RecapAiWindow | null {
  if (!window) return null;
  return now.getTime() - window.generatedAt < ONE_DAY ? window : null;
}

function createRecapAiWindow({
  lastRecapVisitAt,
  now,
  weekSince,
}: {
  lastRecapVisitAt: number | null;
  now: Date;
  weekSince: string;
}): RecapAiWindow {
  const shouldRecapSinceLastVisit =
    lastRecapVisitAt !== null && now.getTime() - lastRecapVisitAt >= ONE_DAY;

  if (shouldRecapSinceLastVisit && lastRecapVisitAt) {
    return {
      mode: "since-last-visit",
      since: isoDateFromTimestamp(lastRecapVisitAt),
      sourceVisitAt: lastRecapVisitAt,
      generatedAt: now.getTime(),
      key: `since:${lastRecapVisitAt}`,
    };
  }

  return {
    mode: "weekly",
    since: weekSince,
    sourceVisitAt: null,
    generatedAt: now.getTime(),
    key: `week:${weekSince}`,
  };
}

export function loadHomeBaseData(): HomeBaseData {
  const now = new Date();
  const weekSince = isoDaysAgo(7, now);
  const timelineSince = isoDaysAgo(60, now);
  const until = isoToday(now);
  const lastRecapVisitAt = getLastRecapVisitAt();
  const recapWindow =
    freshRecapAiWindow(getRecapAiWindow(), now) ??
    createRecapAiWindow({ lastRecapVisitAt, now, weekSince });
  const recapSince = recapWindow.since;

  const goalRow = getCurrentGoal();
  const goal = goalRow?.text ?? null;

  const thisWeekEvents = eventsBetween({ since: recapSince, until, limit: 200 });
  const timelineEvents = eventsBetween({ since: timelineSince, until, limit: 200 });
  const starredIds = new Set(listStars());
  const archivedIds = new Set(listArchives());
  const manualGroups = listManualGroups();
  const manualMemberIds = new Set(manualGroups.flatMap((g) => g.eventIds));

  // Consolidated views (highlights + insight) exclude archived events.
  // Expansive doc (timeline) keeps them — never suppressed.
  const consolidatedThisWeek = thisWeekEvents.filter((e) => !archivedIds.has(e.id));
  const consolidatedTimeline = timelineEvents.filter((e) => !archivedIds.has(e.id));

  const goalFp = goalRow
    ? fingerprint({
        version: goalRow.version,
        text: goalRow.text,
        level: goalRow.level,
        skills: goalRow.skills,
        growthAreas: goalRow.growthAreas,
      })
    : "none";
  const starFp = fingerprint([...starredIds].sort());
  const archiveFp = fingerprint([...archivedIds].sort());
  const manualFp = fingerprint(
    manualGroups.map((group) => ({
      id: group.id,
      framing: group.framing,
      eventIds: [...group.eventIds].sort(),
    })),
  );

  return {
    goal,
    goalRecord: goalRow ?? null,
    thisWeekEvents: compactEvents(thisWeekEvents),
    timelineEvents: compactEvents(timelineEvents),
    manualGroups,
    starredIds,
    archivedIds,
    consolidatedThisWeek,
    consolidatedTimeline,
    manualMemberIds,
    weekSince: recapSince,
    recapMode: recapWindow.mode,
    lastRecapVisitAt,
    recapSourceVisitAt: recapWindow.sourceVisitAt,
    recapWindowKey: recapWindow.key,
    timelineSince,
    until,
    goalFp,
    starFp,
    archiveFp,
    manualFp,
  };
}

export async function loadWeeklyAiData(base: HomeBaseData): Promise<WeeklyAiData> {
  const {
    archiveFp,
    consolidatedThisWeek,
    goal,
    goalFp,
    starredIds,
    starFp,
    until,
    weekSince,
  } = base;

  const weekKey = `highlights:${base.recapWindowKey}:${goalFp}:${starFp}:${archiveFp}`;
  const insightKey = `insight:${base.recapWindowKey}:${goalFp}:${archiveFp}`;

  const [highlightsResult, insightResult] = await Promise.all([
    aiCachedWithStatus<{ highlights: WeeklyHighlight[]; reasoning: string }>(
      weekKey,
      ONE_DAY,
      () =>
        generateWeeklyHighlights({
          events: consolidatedThisWeek,
          since: weekSince,
          until,
          goal,
          starredIds: [...starredIds],
        }).catch((err) => {
          console.error("highlights failed:", err);
          return { highlights: [], reasoning: "error" };
        }),
    ),
    aiCachedWithStatus<Insight>(insightKey, ONE_DAY, () =>
      generateForgottenInsight({
        events: consolidatedThisWeek,
        since: weekSince,
        until,
        goal,
      }).catch((err) => {
        console.error("insight failed:", err);
        return {
          eventId: null,
          callout: "(none)",
          reasoning: "error",
          confidence: 0,
        };
      }),
    ),
  ]);

  if (highlightsResult.refreshed || insightResult.refreshed) {
    recordRecapAiWindow({
      mode: base.recapMode,
      since: base.weekSince,
      sourceVisitAt: base.recapSourceVisitAt,
      generatedAt: Date.now(),
      key: base.recapWindowKey,
    });
  }

  return {
    highlights: highlightsResult.value.highlights,
    insight: insightResult.value,
  };
}

export async function loadTimelineAiData(base: HomeBaseData): Promise<TimelineAiData> {
  const {
    archiveFp,
    consolidatedTimeline,
    manualFp,
    manualMemberIds,
  } = base;

  const groupKey = `groups:rolling-60-days:${manualFp}:${archiveFp}`;

  const groupsResult = await aiCached<{ groups: EventGroup[] }>(groupKey, ONE_DAY, () =>
    generateGrouping({
      events: consolidatedTimeline,
      excludeIds: [...manualMemberIds],
    }).catch((err) => {
      console.error("grouping failed:", err);
      return { groups: [] };
    }),
  );

  return {
    aiGroups: groupsResult.groups,
  };
}

export async function loadHomeData(): Promise<HomeData> {
  const base = loadHomeBaseData();
  const [weekly, timeline] = await Promise.all([
    loadWeeklyAiData(base),
    loadTimelineAiData(base),
  ]);

  return {
    goal: base.goal,
    goalRecord: base.goalRecord,
    thisWeekEvents: base.thisWeekEvents,
    timelineEvents: base.timelineEvents,
    highlights: weekly.highlights,
    insight: weekly.insight,
    aiGroups: timeline.aiGroups,
    manualGroups: base.manualGroups,
    starredIds: base.starredIds,
    archivedIds: base.archivedIds,
  };
}

export function loadYesterdayStandupSummary(): StandupSummary {
  const range = getYesterdayRange();
  const lookup = getStandupLookupRange(range);
  const events = eventsBetween({
    since: lookup.since,
    until: lookup.until,
    limit: 300,
  });
  return buildStandupSummary(filterStandupEvents(events, range), range);
}

// ── Inbox data ─────────────────────────────────────────────────────

export interface InboxData {
  events: Event[];
  starredIds: Set<string>;
  archivedIds: Set<string>;
  manualGroups: ManualGroup[];
  /** AI-suggested groupings over inbox events, excluding ones already
   * in a manual group. Engineer accepts/rejects in /inbox. */
  suggestions: EventGroup[];
}

interface InboxBaseData {
  events: Event[];
  starredIds: Set<string>;
  archivedIds: Set<string>;
  manualGroups: ManualGroup[];
  manualMemberIds: Set<string>;
  suggestionKey: string;
}

function loadInboxBaseData(): InboxBaseData {
  const now = new Date();
  const since = isoDaysAgo(14, now);
  const until = isoToday(now);

  const events = eventsBetween({ since, until, limit: 300 });
  const starredIds = new Set(listStars());
  const archivedIds = new Set(listArchives());
  const manualGroups = listManualGroups();
  const manualMemberIds = new Set(manualGroups.flatMap((g) => g.eventIds));

  const eventFp = fingerprint(events.map((event) => [event.id, event.ts]));
  const manualFp = fingerprint(
    manualGroups.map((group) => ({
      id: group.id,
      framing: group.framing,
      eventIds: [...group.eventIds].sort(),
    })),
  );
  const suggestionKey = `inbox-suggestions:${since}:${until}:${eventFp}:${manualFp}`;

  return {
    events,
    starredIds,
    archivedIds,
    manualGroups,
    manualMemberIds,
    suggestionKey,
  };
}

export function loadInboxData(): InboxData {
  const { manualMemberIds: _manualMemberIds, suggestionKey, ...base } = loadInboxBaseData();
  const suggestions = aiCacheGet<EventGroup[]>(suggestionKey) ?? [];

  return { ...base, suggestions };
}

export async function refreshInboxSuggestions(): Promise<EventGroup[]> {
  const { events, manualMemberIds, suggestionKey } = loadInboxBaseData();
  if (events.length === 0) return [];

  return aiCached<EventGroup[]>(suggestionKey, TEN_MINUTES, async () => {
    const result = await generateGrouping({
      events,
      excludeIds: [...manualMemberIds],
    }).catch((err) => {
      console.error("inbox grouping failed:", err);
      return { groups: [] };
    });
    return result.groups;
  });
}
