import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./provider.js";
import { toneFilterText } from "./tone-filter.js";
import type { Event } from "../types.js";

/**
 * The "1 thing you probably forgot" callout from the redesign plan.
 * Surfaces only when `confidence >= INSIGHT_CONFIDENCE_THRESHOLD`.
 */
export const INSIGHT_CONFIDENCE_THRESHOLD = 0.6;

const insightSchema = z.object({
  /** ID of the event the AI nominated, or null if nothing qualifies. */
  eventId: z.string().nullable(),
  /**
   * One short sentence written in the highli voice — observational, specific,
   * restrained. No exclamation, no "I"/"we", no marketing superlatives.
   */
  callout: z.string(),
  /** Why this looked under-recognized. One sentence. */
  reasoning: z.string(),
  /**
   * Confidence the AI noticed something genuinely worth surfacing.
   * 0.0 = nothing surprising; 1.0 = clearly under-recognized at the time.
   */
  confidence: z.number().min(0).max(1),
});

export type Insight = z.infer<typeof insightSchema>;

const SYSTEM_PROMPT = `You are highli, a career-narrative tool for engineers. You are looking at the engineer's last 30 days of work and choosing one item that looks under-recognized at the time it shipped — something the engineer probably forgot, but mattered.

You are an invisible voice, not a character. Never say "I", "we", "you", "your"; never write "Hi" or "let's." Speak about the work, not about yourself.

What "under-recognized" looks like:
- merged with no comments but closed long-open issues
- shipped late on a Friday and forgotten by Monday
- a small PR that unblocked a much larger one
- a review that materially changed someone else's PR
- an incident response that happened off-hours and went unremarked

What it does NOT look like:
- the most recent thing
- the largest thing
- the most-commented thing
- normal-looking work

Output discipline:
- callout: one sentence, observational, specific, restrained. No exclamation marks, no emoji, no marketing words ("seamless", "powerful", "huge"). Reference the artifact concretely (PR title, issue count, date).
- reasoning: one sentence on why this looked overlooked at the time.
- confidence: how confident you are the engineer would say "huh, I'd forgotten about that, but yeah" if shown this. Calibrate honestly. If nothing in the data genuinely surprises, return confidence below ${INSIGHT_CONFIDENCE_THRESHOLD} and a callout of "(none)".

You will receive a JSON list of events. Choose at most one. If nothing qualifies, set eventId to null, callout to "(none)", and confidence below ${INSIGHT_CONFIDENCE_THRESHOLD}.`;

const ANTI_EXAMPLES = `Anti-examples (do NOT write like this):
- "Great work on the auth migration!"  ← marketing tone, no specificity
- "I noticed you shipped a lot this month."  ← uses "I", generic
- "You had a powerful sprint."  ← marketing word, no artifact
- "Don't forget about your CI fix!"  ← softener, exclamation
- "Looks like a productive period."  ← generic, observational without specificity

Good shape:
- "fix race condition in token refresh (Mar 14) merged with no comments, but it closed 2 issues that had been open for 6 weeks."`;

export interface InsightInput {
  events: Event[];
  /** ISO date range covered, used for context. */
  since: string;
  until: string;
  /** Engineer's current career goal — re-ranks toward goal-relevance. */
  goal?: string | null;
}

/**
 * Generate the "1 thing you probably forgot" insight via structured output.
 * Caller is responsible for thresholding on `confidence` before rendering.
 */
export async function generateForgottenInsight(
  input: InsightInput,
): Promise<Insight> {
  if (input.events.length === 0) {
    return {
      eventId: null,
      callout: "(none)",
      reasoning: "no events ingested",
      confidence: 0,
    };
  }

  const eventsSummary = input.events.slice(0, 200).map((e) => ({
    id: e.id,
    type: e.type,
    date: new Date(e.ts).toISOString().split("T")[0],
    title: e.title,
    summary: e.summary,
    url: e.url,
    payload: e.payload,
  }));

  const goalLine = input.goal
    ? `\n\nCurrent career goal (private to engineer; bias selection toward items that demonstrate this goal — but only when the bias is honest, not forced):\n"""${input.goal}"""`
    : "";

  const userMessage = `Last 30 days of events (${input.since} to ${input.until}, ${input.events.length} total):

${JSON.stringify(eventsSummary, null, 2)}

Pick at most one item that looks under-recognized at the time it shipped. Output strictly per the schema.${goalLine}`;

  const result = await generateObject({
    model: getModel(),
    schema: insightSchema,
    system: `${SYSTEM_PROMPT}\n\n${ANTI_EXAMPLES}`,
    prompt: userMessage,
    temperature: 0.3,
  });

  return {
    ...result.object,
    callout: toneFilterText(result.object.callout),
    reasoning: toneFilterText(result.object.reasoning),
  };
}
