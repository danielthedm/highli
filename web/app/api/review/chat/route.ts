import { NextRequest } from "next/server";
import { convertToCoreMessages, streamText, type Message } from "ai";
import {
  buildSystemPrompt,
  getModel,
} from "@highli/core/ai";
import {
  allSources,
  getActiveTools,
} from "@highli/sources";
import { getCurrentGoal } from "@/lib/store";

export const runtime = "nodejs";

const TONE_HEADER = `
## Tone (web /review surface — non-negotiable)
- You are an invisible voice. Never write "I", "I'm", "I'll", "we", "we're", "let's". Speak about the work, not about yourself.
- Drafts you generate are written in first person from the engineer's perspective — that is the *content*, not your voice.
- No "Hi [name]", no exclamation points, no marketing words ("powerful", "seamless", "delightful", "huge", "exciting"), no rhetorical questions, no celebratory openings.
- Observational and specific. Reference the artifact (PR #, doc title, date) when surfacing evidence.
- Restraint over enthusiasm. "Done." beats "Great job!"
`;

export async function POST(req: NextRequest) {
  const { messages }: { messages: Message[] } = await req.json();

  const goal = getCurrentGoal();
  const goalNote = goal
    ? `\n## Current career goal (engineer-private — bias drafts toward this)\n${goal.text}\n${goal.level ? `Level targeted: ${goal.level}\n` : ""}${goal.skills ? `Skills: ${goal.skills}\n` : ""}${goal.growthAreas ? `Growth areas: ${goal.growthAreas}\n` : ""}`
    : "";

  const baseSystem = buildSystemPrompt(allSources);
  const system = `${baseSystem}\n${TONE_HEADER}${goalNote}`;

  const result = streamText({
    model: getModel(),
    system,
    messages: convertToCoreMessages(messages),
    tools: getActiveTools(),
    maxSteps: 20,
    maxTokens: 16000,
  });

  return result.toDataStreamResponse();
}
