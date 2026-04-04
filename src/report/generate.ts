import { streamText } from "ai";
import { getModel } from "../agent/provider.js";
import { getEnabledTools } from "../agent/tools.js";
import { buildReportPrompt, buildBragPrompt } from "./prompt.js";

export interface GenerateCallbacks {
  onToolStart: (name: string) => void;
  onToolDone: (name: string) => void;
  onTextDelta: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export type GenerateMode = "report" | "brag";

const USER_MESSAGES: Record<GenerateMode, (from: string, to: string) => string> = {
  report: (from, to) =>
    `Generate a comprehensive insights report for my work from ${from} to ${to}. Pull data from all available sources and analyze everything. Start by gathering data from all sources in parallel, then write the full report.`,
  brag: (from, to) =>
    `Generate a brag document for my work from ${from} to ${to}. Pull data from every available source — GitHub, Linear, Slack, Notion, Claude Code logs, everything connected. Gather all data first in parallel, then synthesize into the brag doc.`,
};

const PROMPT_BUILDERS: Record<GenerateMode, (timeframe: { from: string; to: string }) => string> = {
  report: buildReportPrompt,
  brag: buildBragPrompt,
};

export async function generate(
  mode: GenerateMode,
  timeframe: { from: string; to: string },
  callbacks: GenerateCallbacks,
): Promise<void> {
  const system = PROMPT_BUILDERS[mode](timeframe);
  const tools = getEnabledTools();
  const userMessage = USER_MESSAGES[mode](timeframe.from, timeframe.to);

  let fullText = "";

  try {
    const result = streamText({
      model: getModel(),
      system,
      messages: [{ role: "user", content: userMessage }],
      tools,
      maxSteps: 15,
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
