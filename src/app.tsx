import React, { useState, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import { Header } from "./components/Header.js";
import { ChatMessage, StreamingMessage } from "./components/ChatMessage.js";
import { ChatInput } from "./components/ChatInput.js";
import { ToolStatus } from "./components/ToolStatus.js";
import { useConversation } from "./hooks/useConversation.js";
import { useExport } from "./hooks/useExport.js";
import { getActiveSourceNames } from "./sources/registry.js";

interface AppProps {
  timeframe?: { from: string; to: string };
  screenshotPath?: string;
}

export function App({ timeframe, screenshotPath }: AppProps) {
  const { exit } = useApp();
  const sources = getActiveSourceNames();
  const { messages, streamingText, isStreaming, activeTools, sendMessage } =
    useConversation(timeframe);
  const { exportReview, copyToClipboard, exportPath } = useExport();
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Send initial screenshot if provided
  const [initialSent, setInitialSent] = useState(false);
  if (screenshotPath && !initialSent) {
    setInitialSent(true);
    sendMessage(
      "Here is a screenshot of my performance review form. Please extract all the questions I need to answer.",
      screenshotPath,
    );
  }

  const handleSubmit = useCallback(
    (message: string) => {
      sendMessage(message);
    },
    [sendMessage],
  );

  const handleScreenshot = useCallback(
    (path: string) => {
      sendMessage(
        "Here is a screenshot of my performance review form. Please extract all the questions I need to answer.",
        path,
      );
    },
    [sendMessage],
  );

  const handleExport = useCallback(async () => {
    // Find the last assistant message that looks like a review draft
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) {
      setExportStatus("No review content to export yet.");
      return;
    }

    try {
      const path = await exportReview(lastAssistant.content);
      setExportStatus(`Saved to ${path}`);
      await copyToClipboard(lastAssistant.content);
      setExportStatus(`Saved to ${path} (and copied to clipboard)`);
    } catch (err: any) {
      setExportStatus(`Export failed: ${err.message}`);
    }
  }, [messages, exportReview, copyToClipboard]);

  const handleQuit = useCallback(() => {
    exit();
  }, [exit]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header timeframe={timeframe} sources={sources} />

      {messages.length === 0 && !isStreaming && (
        <Box marginBottom={1}>
          <Text color="gray">
            Paste your review questions to get started, or use /screenshot
            &lt;path&gt; for an image of your review form.
          </Text>
        </Box>
      )}

      {messages.map((msg, i) => (
        <ChatMessage key={i} message={msg} />
      ))}

      <ToolStatus tools={activeTools} />

      {streamingText && <StreamingMessage text={streamingText} />}

      {exportStatus && (
        <Box marginBottom={1}>
          <Text color="green">{exportStatus}</Text>
        </Box>
      )}

      <ChatInput
        onSubmit={handleSubmit}
        onScreenshot={handleScreenshot}
        onExport={handleExport}
        onQuit={handleQuit}
        disabled={isStreaming}
      />
    </Box>
  );
}
