import { streamText } from "ai";
import { getModel } from "../agent/provider.js";
import { getEnabledTools } from "../agent/tools.js";
import { buildReportPrompt, buildBragPrompt, buildBragAmendPrompt } from "./prompt.js";

export interface GenerateCallbacks {
  onToolStart: (name: string) => void;
  onToolDone: (name: string) => void;
  onTextDelta: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export type GenerateMode = "report" | "brag" | "brag-amend";

export interface GenerateOptions {
  existingBrag?: string;
}

const USER_MESSAGES: Record<GenerateMode, (from: string, to: string) => string> = {
  report: (from, to) =>
    `Generate a comprehensive insights report for my work from ${from} to ${to}. Pull data from all available sources and analyze everything. Start by gathering data from all sources in parallel, then write the full report.`,
  brag: (from, to) =>
    `Generate a brag document for my work from ${from} to ${to}. Pull data from every available source — GitHub, Linear, Slack, Notion, Claude Code logs, everything connected. Gather all data first in parallel, then synthesize into the brag doc.`,
  "brag-amend": (from, to) =>
    `Update my existing brag document with new accomplishments from ${from} to ${to}. Pull data from all available sources for this new period, then merge the new items into the existing doc. Output the complete updated document.`,
};

export async function generate(
  mode: GenerateMode,
  timeframe: { from: string; to: string },
  callbacks: GenerateCallbacks,
  options?: GenerateOptions,
): Promise<void> {
  let system: string;
  if (mode === "brag-amend" && options?.existingBrag) {
    system = buildBragAmendPrompt(timeframe, options.existingBrag);
  } else if (mode === "brag-amend") {
    // Fallback to fresh brag if no existing doc
    system = buildBragPrompt(timeframe);
  } else if (mode === "brag") {
    system = buildBragPrompt(timeframe);
  } else {
    system = buildReportPrompt(timeframe);
  }
  const tools = getEnabledTools();
  const userMessage = USER_MESSAGES[mode](timeframe.from, timeframe.to);

  let fullText = "";

  try {
    const result = streamText({
      model: getModel(),
      system,
      messages: [{ role: "user", content: userMessage }],
      tools,
      maxSteps: 25,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          fullText += part.textDelta;
          callbacks.onTextDelta(part.textDelta);
          break;
        case "tool-call":
          callbacks.onToolStart(part.toolName);
          break;
        case "step-finish":
          break;
      }
    }

    const finalText = await result.text;
    callbacks.onDone(finalText);
  } catch (error: any) {
    callbacks.onError(error);
  }
}

/** @deprecated Use `generate("report", ...)` instead */
export async function generateReport(
  timeframe: { from: string; to: string },
  callbacks: GenerateCallbacks,
): Promise<void> {
  return generate("report", timeframe, callbacks);
}
