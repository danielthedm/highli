import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./provider.js";
import { toneFilterText } from "./tone-filter.js";
import type { Event } from "../types.js";

const highlightSchema = z.object({
  highlights: z
    .array(
      z.object({
        eventId: z.string(),
        title: z
          .string()
          .describe(
            "5–10 word framing of the highlight in the engineer's narrative voice. Specific, observational, restrained.",
          ),
        oneLiner: z
          .string()
          .describe(
            "One sentence describing why this mattered. Reference the artifact concretely. No marketing words. No 'I' or 'we'.",
          ),
      }),
    )
    .min(0)
    .max(4),
  // Why these particular highlights, briefly. Used for debugging — never shown.
  reasoning: z.string(),
});

export type WeeklyHighlight = z.infer<typeof highlightSchema>["highlights"][number];

export interface WeeklyHighlightsInput {
  events: Event[];
  since: string;
  until: string;
  /** Current career goal — re-ranks highlights toward goal-relevance. */
  goal?: string | null;
  /**
   * Engineer-starred event IDs. A "this mattered" signal — bumped in
   * selection but never auto-included; final pick is still the AI's call.
   */
  starredIds?: string[];
}

const SYSTEM_PROMPT = `You are highli, choosing the 2–4 most worth-remembering items from an engineer's week. You are an invisible voice — never say "I", "we", "you", "your".

Selection criteria:
- Specific to a real artifact (PR, issue, commit, doc) — not generic patterns.
- Mix sizes: a small high-leverage item beats a large routine one.
- If a career goal is provided, lean toward items that demonstrate the targeted growth.
- Skip noise (dependency bumps, automated commits, trivial fixes) unless they unblocked something.
- Return between 0 and 4 items. If the week is genuinely thin, return fewer or none — do not pad.

Tone:
- Title: 5–10 words, observational ("auth-migration unblocked", not "Great auth-migration work!").
- One-liner: a single sentence that says what shipped and why it mattered. Reference the artifact concretely. No exclamation, no marketing words ("seamless", "powerful", "huge", "critical"), no questions, no "I".

Anti-examples (do NOT write like this):
- "Big week!"
- "I noticed you shipped a lot."
- "Powerful refactor of the api layer."
- "Don't forget about your CI fixes!"

Good shape:
- title: "auth-migration unblocked"
  oneLiner: "merging the token-refresh fix unblocked the auth-migration project that 4 other engineers were waiting on."
`;

export async function generateWeeklyHighlights(
  input: WeeklyHighlightsInput,
): Promise<{ highlights: WeeklyHighlight[]; reasoning: string }> {
  if (input.events.length === 0) {
    return { highlights: [], reasoning: "no events" };
  }

  const trimmed = input.events.slice(0, 200).map((e) => ({
    id: e.id,
    type: e.type,
    date: new Date(e.ts).toISOString().split("T")[0],
    title: e.title,
    summary: e.summary,
    url: e.url,
    payload: e.payload,
  }));

  const goalLine = input.goal
    ? `\n\nCurrent career goal (private to engineer; condition selection on this):\n"""${input.goal}"""`
    : "";

  const starSet = new Set(input.starredIds ?? []);
  const starredLine =
    starSet.size > 0
      ? `\n\nStarred event ids (engineer flagged "this mattered" — bias toward them, but skip if a starred item is genuinely routine):\n${[...starSet].join(", ")}`
      : "";

  const prompt = `Events for the week of ${input.since} to ${input.until} (${input.events.length} total):

${JSON.stringify(trimmed, null, 2)}

Pick 2–4 items worth remembering. Output strictly per the schema.${goalLine}${starredLine}`;

  const result = await generateObject({
    model: getModel(),
    schema: highlightSchema,
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
  });

  return {
    highlights: result.object.highlights.map((highlight) => ({
      ...highlight,
      title: toneFilterText(highlight.title),
      oneLiner: toneFilterText(highlight.oneLiner),
    })),
    reasoning: toneFilterText(result.object.reasoning),
  };
}

// ── AI grouping ───────────────────────────────────────────────────

const groupingSchema = z.object({
  groups: z.array(
    z.object({
      framing: z
        .string()
        .describe(
          "One short sentence describing what this group represents — e.g. 'auth-migration project' or 'release prep for v2.4'.",
        ),
      eventIds: z
        .array(z.string())
        .min(2)
        .describe("Event ids that belong to this group."),
    }),
  ),
});

export type EventGroup = z.infer<typeof groupingSchema>["groups"][number];

export interface GroupingInput {
  events: Event[];
  /**
   * Event IDs already in manual groups — skip these so the AI doesn't
   * re-suggest groupings the engineer already confirmed.
   */
  excludeIds?: string[];
}

const GROUPING_SYSTEM_PROMPT = `You are highli, identifying coherent project / theme groupings inside a list of engineering events.

Rules:
- A group needs at least 2 events. Lone items stay flat.
- Groups should be tight — same project, same initiative, same release. Not "all backend work this month".
- Pick at most 6 groups; the rest stay flat.
- The framing line is one short sentence in narrative voice — observational, specific, no marketing tone.

Output the groupings strictly per schema. Events not in any group are implicitly flat.`;

export async function generateGrouping(
  input: GroupingInput,
): Promise<{ groups: EventGroup[] }> {
  const exclude = new Set(input.excludeIds ?? []);
  const candidates = input.events.filter((e) => !exclude.has(e.id));
  if (candidates.length < 4) return { groups: [] };

  const trimmed = candidates.slice(0, 200).map((e) => ({
    id: e.id,
    type: e.type,
    date: new Date(e.ts).toISOString().split("T")[0],
    title: e.title,
    summary: e.summary,
    payload: e.payload,
  }));

  const result = await generateObject({
    model: getModel(),
    schema: groupingSchema,
    system: GROUPING_SYSTEM_PROMPT,
    prompt: `Events:\n\n${JSON.stringify(trimmed, null, 2)}`,
    temperature: 0.2,
  });

  return {
    groups: result.object.groups.map((group) => ({
      ...group,
      framing: toneFilterText(group.framing),
    })),
  };
}
