import { useState, useCallback, useRef } from "react";
import { streamText, type CoreMessage, type CoreUserMessage } from "ai";
import { getModel } from "../agent/provider.js";
import { buildSystemPrompt } from "../agent/system-prompt.js";
import { getEnabledTools } from "../agent/tools.js";
import type { ChatMessage, ActiveTool } from "../agent/types.js";
import { readImageAsBase64 } from "../utils/image.js";

export interface UseConversationOptions {
  /** Override the default review system prompt — used by peer-review chat mode. */
  systemPrompt?: string;
}

export function useConversation(
  timeframe?: { from: string; to: string },
  options?: UseConversationOptions,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const coreMessagesRef = useRef<CoreMessage[]>([]);
  const systemPromptRef = useRef<string | undefined>(options?.systemPrompt);
  systemPromptRef.current = options?.systemPrompt;

  const sendMessage = useCallback(
    async (content: string, screenshotPath?: string) => {
      // Build user message
      const userChatMessage: ChatMessage = {
        role: "user",
        content,
        imageUrl: screenshotPath,
      };
      setMessages((prev) => [...prev, userChatMessage]);

      // Build core message for AI SDK
      let userMessage: CoreUserMessage;
      if (screenshotPath) {
        const image = await readImageAsBase64(screenshotPath);
        userMessage = {
          role: "user",
          content: [
            {
              type: "image",
              image: `data:${image.mimeType};base64,${image.base64}`,
            },
            { type: "text", text: content },
          ],
        };
      } else {
        userMessage = { role: "user", content };
      }

      coreMessagesRef.current.push(userMessage);

      setIsStreaming(true);
      setStreamingText("");
      setActiveTools([]);

      let fullText = "";

      try {
        const result = streamText({
          model: getModel(),
          system: systemPromptRef.current ?? buildSystemPrompt(timeframe),
          messages: coreMessagesRef.current,
          tools: getEnabledTools(),
          maxSteps: 20,
          onStepFinish: ({ toolCalls, toolResults }) => {
            if (toolCalls && toolCalls.length > 0) {
              setActiveTools((prev) =>
                prev.map((t) => ({ ...t, status: "done" as const })),
              );
            }
          },
        });

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "text-delta":
              fullText += part.textDelta;
              setStreamingText(fullText);
              break;
            case "tool-call":
              setActiveTools((prev) => [
                ...prev,
                {
                  id: part.toolCallId,
                  name: part.toolName,
                  status: "running",
                  startedAt: Date.now(),
                },
              ]);
              break;
            case "step-finish":
              // Mark all running tools as done when a step finishes
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.status === "running"
                    ? { ...t, status: "done" as const }
                    : t,
                ),
              );
              // Reset streaming text for next step
              fullText = "";
              setStreamingText("");
              break;
            case "error":
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.status === "running"
                    ? { ...t, status: "error" as const }
                    : t,
                ),
              );
              break;
          }
        }

        // Get final result
        const finalText = await result.text;
        coreMessagesRef.current.push({
          role: "assistant",
          content: finalText,
        });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: finalText,
            toolCalls: activeTools
              .filter((t) => t.status === "done")
              .map((t) => ({ name: t.name, result: "completed" })),
          },
        ]);
      } catch (error: any) {
        const errorMsg =
          error.message ?? "An error occurred while getting a response.";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${errorMsg}` },
        ]);
      } finally {
        setStreamingText("");
        setIsStreaming(false);
        setActiveTools([]);
      }
    },
    [timeframe],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
    setActiveTools([]);
    coreMessagesRef.current = [];
  }, []);

  return {
    messages,
    streamingText,
    isStreaming,
    activeTools,
    sendMessage,
    reset,
  };
}
