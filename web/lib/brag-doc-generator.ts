import "server-only";
import { generateText } from "ai";
import { getModel } from "@highli/core/ai";
import {
  eventsBetween,
  listArchives,
  listManualGroups,
  listStars,
  type ManualGroup,
} from "@highli/core/db";
import type { Event } from "@highli/core/types";
import {
  readLastBragDocument,
  saveDocument,
  type SavedDocument,
} from "@highli/core/documents";

const ALL_TIME_START = "2000-01-01";

export interface GenerateBragDocResult {
  ok: true;
  changed: boolean;
  mode: "generate" | "amend";
  eventsUsed: number;
  document: SavedDocument;
  message: string;
}

function isoToday(): string {
  return new Date().toISOString().split("T")[0];
}

function eventDate(event: Event): string {
  return new Date(event.ts).toISOString().split("T")[0];
}

function compactEvent(event: Event, starredIds: Set<string>) {
  return {
    id: event.id,
    date: eventDate(event),
    source: event.source,
    type: event.type,
    title: event.title,
    summary: event.summary ?? "",
    url: event.url ?? "",
    starred: starredIds.has(event.id),
  };
}

function compactGroup(group: ManualGroup, eventIds: Set<string>) {
  return {
    framing: group.framing,
    eventIds: group.eventIds.filter((id) => eventIds.has(id)),
  };
}

function buildGeneratePrompt({
  from,
  to,
  events,
  manualGroups,
}: {
  from: string;
  to: string;
  events: ReturnType<typeof compactEvent>[];
  manualGroups: ReturnType<typeof compactGroup>[];
}): string {
  return `Create the living brag doc from raw timeline evidence.

## Source of truth
Use only the evidence in this prompt. Do not invent projects, dates, metrics, links, people, impact, or outcomes that are not present.

## Date range
${from} to ${to}

## Manual groups
Engineer-confirmed groupings. Prefer these as project/theme sections when they have evidence.
${JSON.stringify(manualGroups, null, 2)}

## Timeline events
${JSON.stringify(events, null, 2)}

## Output
Return the complete markdown document. No preamble, no commentary.

## Structure
# Brag doc

## Summary
2-4 direct sentences about the strongest patterns in the evidence.

## Highlights
Group by project/theme. Each group should include:
- A one-line summary of what was done.
- Bulleted linked evidence. Prefer links when a URL exists.
- Brief impact phrasing only when supported by the event title or summary.

## Other contributions
Evidence that matters but does not fit a larger project.

## By the numbers
Counts by source and type, derived from the provided events.

## Writing rules
- Write in first person from the engineer's perspective.
- Keep it list-forward and scannable.
- Preserve concrete titles and links.
- Prefer specific artifact names over generic accomplishments.
- Starred events are stronger curation signals, but do not include routine items only because they are starred.
- Archived events are not included in this prompt and should not appear.`;
}

function buildAmendPrompt({
  from,
  to,
  existingBrag,
  events,
  manualGroups,
}: {
  from: string;
  to: string;
  existingBrag: string;
  events: ReturnType<typeof compactEvent>[];
  manualGroups: ReturnType<typeof compactGroup>[];
}): string {
  return `Update the existing living brag doc with new raw timeline evidence.

## Source of truth
Use only the existing document and the new evidence in this prompt. Do not invent projects, dates, metrics, links, people, impact, or outcomes that are not present.

## Existing brag doc
${existingBrag}

## New evidence range
${from} to ${to}

## Manual groups touching new evidence
${JSON.stringify(manualGroups, null, 2)}

## New timeline events
${JSON.stringify(events, null, 2)}

## Output
Return the complete updated markdown document. No preamble, no commentary.

## Merge rules
- Add new evidence to the best existing project/theme section when it fits.
- Create a new project/theme section when the evidence does not fit an existing section.
- Do not duplicate links or bullets already present in the existing doc.
- Preserve useful existing wording and structure.
- Update summary and "By the numbers" so the doc remains cumulative.
- Keep it list-forward and scannable.
- Write in first person from the engineer's perspective.
- Starred events are stronger curation signals, but do not include routine items only because they are starred.`;
}

export async function generateLivingBragDoc(): Promise<GenerateBragDocResult> {
  const existing = await readLastBragDocument();
  const to = isoToday();
  const from = existing?.manifest.lastRunDate ?? ALL_TIME_START;
  const mode = existing ? "amend" : "generate";

  const archivedIds = new Set(listArchives());
  const starredIds = new Set(listStars());
  const rawEvents = eventsBetween({ since: from, until: to }).filter(
    (event) => !archivedIds.has(event.id),
  );

  if (rawEvents.length === 0) {
    if (!existing) {
      throw new Error("No raw timeline events found. Pull data before generating a brag doc.");
    }

    const document = await saveDocument({
      kind: "brag",
      title: "Living brag doc",
      content: existing.content,
      timeframe: { from, to },
      source: "web",
    });

    return {
      ok: true,
      changed: false,
      mode,
      eventsUsed: 0,
      document,
      message: `No new raw timeline events found since ${from}. The existing brag doc was left intact.`,
    };
  }

  const eventIds = new Set(rawEvents.map((event) => event.id));
  const events = rawEvents
    .sort((a, b) => b.ts - a.ts)
    .map((event) => compactEvent(event, starredIds));
  const manualGroups = listManualGroups()
    .map((group) => compactGroup(group, eventIds))
    .filter((group) => group.eventIds.length > 0);

  const prompt = existing
    ? buildAmendPrompt({
        from,
        to,
        existingBrag: existing.content,
        events,
        manualGroups,
      })
    : buildGeneratePrompt({
        from,
        to,
        events,
        manualGroups,
      });

  const result = await generateText({
    model: getModel(),
    system:
      "You are highli, turning raw engineering evidence into a living brag doc. Be concrete, restrained, and faithful to the provided evidence.",
    prompt,
    temperature: 0.2,
    maxTokens: 32000,
  });

  const content = result.text.trim();
  if (!content) {
    throw new Error("AI returned an empty brag doc.");
  }

  const document = await saveDocument({
    kind: "brag",
    title: "Living brag doc",
    content,
    timeframe: { from, to },
    source: "web",
  });

  return {
    ok: true,
    changed: true,
    mode,
    eventsUsed: events.length,
    document,
    message:
      mode === "generate"
        ? `Generated the living brag doc from ${events.length} timeline events.`
        : `Amended the living brag doc with ${events.length} timeline events since ${from}.`,
  };
}
