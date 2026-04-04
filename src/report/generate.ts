import { streamText } from "ai";
import { getModel } from "../agent/provider.js";
import { getEnabledTools } from "../agent/tools.js";
import { buildReportPrompt } from "./prompt.js";

export interface ReportCallbacks {
  onToolStart: (name: string) => void;
  onToolDone: (name: string) => void;
  onTextDelta: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export async function generateReport(
  timeframe: { from: string; to: string },
  callbacks: ReportCallbacks,
): Promise<void> {
  const system = buildReportPrompt(timeframe);
  const tools = getEnabledTools();

  const userMessage = `Generate a comprehensive insights report for my work from ${timeframe.from} to ${timeframe.to}. Pull data from all available sources and analyze everything. Start by gathering data from all sources in parallel, then write the full report.`;

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
