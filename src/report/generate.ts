import { streamText } from "ai";
import { getModel } from "../agent/provider.js";
import { getEnabledTools } from "../agent/tools.js";
import {
  buildReportPrompt,
  buildBragPrompt,
  buildBragAmendPrompt,
  buildReportOnPrompt,
  buildPeerCollabPrompt,
} from "./prompt.js";
import type { TargetUser } from "./target-user.js";

export interface GenerateCallbacks {
  onToolStart: (name: string) => void;
  onToolDone: (name: string) => void;
  onTextDelta: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export type GenerateMode =
  | "report"
  | "brag"
  | "brag-amend"
  | "report-on"
  | "peer-collab";

export interface GenerateOptions {
  existingBrag?: string;
  targetUser?: TargetUser;
}

const USER_MESSAGES: Record<GenerateMode, (from: string, to: string) => string> = {
  report: (from, to) =>
    `Generate a comprehensive insights report for my work from ${from} to ${to}. Pull data from all available sources and analyze everything. Start by gathering data from all sources in parallel, then write the full report.`,
  brag: (from, to) =>
    `Generate the most comprehensive possible brag document for my work from ${from} to ${to}. Pull data from GitHub, Linear, Slack, and Notion — do NOT use Claude Code tools. Gather ALL data first: every PR, every review, every commit, every Linear issue, every Notion doc. Run multiple Slack searches with different queries. Fetch the content of every relevant Notion page. Then synthesize into an exhaustive brag doc with links to everything.`,
  "brag-amend": (from, to) =>
    `Update my existing brag document with new accomplishments from ${from} to ${to}. Pull data from all available sources for this new period, then merge the new items into the existing doc. Output the complete updated document.`,
  "report-on": (from, to) =>
    `Generate a comprehensive report about this team member's work from ${from} to ${to}. Pull data from all available sources — GitHub, Linear, Slack, Notion. Do NOT use Claude Code tools. Gather ALL data first: every PR, every review, every commit, every Linear issue, every Notion doc. Run multiple Slack searches with different queries. Then synthesize into an exhaustive report with links to everything.`,
  "peer-collab": (from, to) =>
    `Generate a neutral collaboration log between me and this peer from ${from} to ${to}. Focus ONLY on intersection — work where we both meaningfully participated. Start with github_get_collab_prs for direct PR collaboration, then run targeted Slack searches for shared project names and signals ("paired", "helped", "synced"), cross-reference Linear issues/projects for overlap, and search Notion for co-authored or mutually-commented docs. Filter ruthlessly — discard anything that doesn't show both of us interacting. Do NOT use Claude Code tools. Write a factual evidence-only log with links — no evaluation or praise.`,
};

export async function generate(
  mode: GenerateMode,
  timeframe: { from: string; to: string },
  callbacks: GenerateCallbacks,
  options?: GenerateOptions,
): Promise<void> {
  let system: string;
  if (mode === "peer-collab" && options?.targetUser) {
    system = buildPeerCollabPrompt(timeframe, options.targetUser);
  } else if (mode === "report-on" && options?.targetUser) {
    system = buildReportOnPrompt(timeframe, options.targetUser);
  } else if (mode === "brag-amend" && options?.existingBrag) {
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
      maxTokens: 64000,
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
