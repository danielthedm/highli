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
    `Generate the most comprehensive possible brag document for my work from ${from} to ${to}. Pull data from GitHub, Linear, Slack, and Notion — do NOT use Claude Code tools. Gather ALL data first: every PR, every review, every commit, every Linear issue, every Notion doc. Run multiple Slack searches with different queries. Fetch the content of every relevant Notion page. Then synthesize into an exhaustive brag doc with links to everything.`,
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

  // Scale maxSteps based on timeframe length — longer periods produce more
  // data requiring more tool calls (pagination, multiple searches, fetching
  // individual Notion page contents, etc.).
  const days = Math.max(1, Math.ceil(
    (new Date(timeframe.to).getTime() - new Date(timeframe.from).getTime()) / (1000 * 60 * 60 * 24),
  ));
  const maxSteps = days > 365 ? 200 : days > 180 ? 150 : days > 90 ? 100 : 75;

  let fullText = "";

  try {
    const result = streamText({
      model: getModel(),
      system,
      messages: [{ role: "user", content: userMessage }],
      tools,
      maxSteps,
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
