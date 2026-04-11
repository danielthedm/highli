import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { getActiveSourceNames } from "../sources/registry.js";
import { generate } from "../report/generate.js";
import { resolveIdentity } from "../report/resolve-identity.js";
import { setTargetUser } from "../report/target-user.js";
import type { TargetUser } from "../report/target-user.js";
import { buildPeerReviewChatPrompt } from "../report/prompt.js";
import { ChatMessage, StreamingMessage } from "./ChatMessage.js";
import { ChatInput } from "./ChatInput.js";
import { ToolStatus } from "./ToolStatus.js";
import { useConversation } from "../hooks/useConversation.js";
import { useExport } from "../hooks/useExport.js";
import { writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { format } from "date-fns";

interface PeerReviewAppProps {
  timeframe: { from: string; to: string };
  name?: string;
  email?: string;
}

type Phase =
  | "input-name"
  | "input-email"
  | "resolving"
  | "generating"
  | "writing-log"
  | "log-done"
  | "prompt-continue"
  | "chat"
  | "error";

interface ToolEntry {
  name: string;
  status: "running" | "done";
  startedAt: number;
}

function formatToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^(\w+) Get /, "Fetching $1 ")
    .replace(/^(\w+) Search /, "Searching $1 ");
}

export function PeerReviewApp({
  timeframe,
  name: initialName,
  email: initialEmail,
}: PeerReviewAppProps) {
  const { exit } = useApp();
  const sources = getActiveSourceNames();

  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [peer, setPeer] = useState<TargetUser | null>(null);
  const [resolvedInfo, setResolvedInfo] = useState<{
    resolved: { source: string; detail: string }[];
    warnings: string[];
  } | null>(null);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [collabLog, setCollabLog] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continueInput, setContinueInput] = useState("");
  const [chatSystemPrompt, setChatSystemPrompt] = useState<string | undefined>(
    undefined,
  );

  const [phase, setPhase] = useState<Phase>(() => {
    if (initialName && initialEmail) return "resolving";
    if (initialName) return "input-email";
    return "input-name";
  });

  // Chat mode — active only when phase === "chat"
  const {
    messages,
    streamingText,
    isStreaming,
    activeTools: chatActiveTools,
    sendMessage,
  } = useConversation(timeframe, { systemPrompt: chatSystemPrompt });
  const { exportReview, copyToClipboard } = useExport();
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Identity resolution
  useEffect(() => {
    if (phase !== "resolving") return;
    resolveIdentity(name, email).then(({ targetUser, resolved, warnings }) => {
      setResolvedInfo({ resolved, warnings });
      setTargetUser(targetUser);
      setPeer(targetUser);
      setTimeout(() => {
        setPhase("generating");
        startGeneration(targetUser);
      }, 1000);
    });
  }, [phase]);

  function startGeneration(targetUser: TargetUser) {
    generate(
      "peer-collab",
      timeframe,
      {
        onToolStart: (toolName) => {
          setTools((prev) => {
            const updated = prev.map((t) =>
              t.status === "running" ? { ...t, status: "done" as const } : t,
            );
            return [
              ...updated,
              { name: toolName, status: "running", startedAt: Date.now() },
            ];
          });
        },
        onToolDone: (toolName) => {
          setTools((prev) =>
            prev.map((t) =>
              t.name === toolName ? { ...t, status: "done" as const } : t,
            ),
          );
        },
        onTextDelta: (delta) => {
          setPhase("writing-log");
          setCollabLog((prev) => prev + delta);
        },
        onDone: async (fullText) => {
          setTools((prev) =>
            prev.map((t) => ({ ...t, status: "done" as const })),
          );

          // Save log to disk
          const dir = join(homedir(), ".highli", "peer-reviews");
          await mkdir(dir, { recursive: true });
          const safeName = targetUser.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
          const filename = `peer-collab-${safeName}-${format(
            new Date(),
            "yyyy-MM-dd-HHmm",
          )}.md`;
          const filePath = join(dir, filename);
          await writeFile(filePath, fullText, "utf-8");
          setSavedPath(filePath);

          setCollabLog(fullText);
          setPhase("prompt-continue");
        },
        onError: (err) => {
          setTargetUser(null);
          setError(err.message);
          setPhase("error");
          setTimeout(() => exit(), 2000);
        },
      },
      { targetUser },
    );
  }

  const handleContinueSubmit = useCallback(
    (value: string) => {
      const answer = value.trim().toLowerCase();
      if (answer === "y" || answer === "yes") {
        if (!peer) return;
        // Build chat system prompt with the collab log as context
        const prompt = buildPeerReviewChatPrompt(timeframe, peer, collabLog);
        setChatSystemPrompt(prompt);
        setPhase("chat");
      } else {
        // Any other answer = no, exit
        setTargetUser(null);
        exit();
      }
    },
    [peer, collabLog, timeframe, exit],
  );

  // Kick off the chat with an opening message from highli once we enter chat phase
  const [chatInitialized, setChatInitialized] = useState(false);
  useEffect(() => {
    if (phase !== "chat" || chatInitialized || !chatSystemPrompt) return;
    setChatInitialized(true);
    // Seed the conversation with the user asking for help — this gets the
    // model to open with its "paste the review questions" prompt.
    sendMessage(
      "I'd like your help writing my peer review for this person. What do you need from me to get started?",
    );
  }, [phase, chatInitialized, chatSystemPrompt, sendMessage]);

  const handleSubmit = useCallback(
    (message: string) => {
      sendMessage(message);
    },
    [sendMessage],
  );

  const handleScreenshot = useCallback(
    (path: string) => {
      sendMessage(
        "Here is a screenshot of the peer review form. Please extract all the questions I need to answer.",
        path,
      );
    },
    [sendMessage],
  );

  const handleExport = useCallback(async () => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) {
      setExportStatus("No review content to export yet.");
      return;
    }
    try {
      const path = await exportReview(lastAssistant.content);
      await copyToClipboard(lastAssistant.content);
      setExportStatus(`Saved to ${path} (and copied to clipboard)`);
    } catch (err: any) {
      setExportStatus(`Export failed: ${err.message}`);
    }
  }, [messages, exportReview, copyToClipboard]);

  const handleQuit = useCallback(() => {
    setTargetUser(null);
    exit();
  }, [exit]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="magenta">
            highli
          </Text>
          <Text color="gray"> — peer review</Text>
        </Box>
        <Box gap={2}>
          <Text color="cyan">
            {timeframe.from} to {timeframe.to}
          </Text>
          <Text color="gray">
            Sources:{" "}
            {sources.length > 0 ? (
              sources.map((s, i) => (
                <Text key={s}>
                  {i > 0 ? ", " : ""}
                  <Text color="green">{s}</Text>
                </Text>
              ))
            ) : (
              <Text color="yellow">none connected</Text>
            )}
          </Text>
        </Box>
        <Text color="gray">{"─".repeat(60)}</Text>
      </Box>

      {phase === "input-name" && (
        <Box>
          <Text color="cyan" bold>
            Peer's name:{" "}
          </Text>
          <TextInput
            value={name}
            onChange={setName}
            onSubmit={(value) => {
              if (value.trim()) {
                setName(value.trim());
                setPhase(initialEmail ? "resolving" : "input-email");
              }
            }}
          />
        </Box>
      )}

      {phase === "input-email" && (
        <Box flexDirection="column">
          <Text color="green">Name: {name}</Text>
          <Box>
            <Text color="cyan" bold>
              Email:{" "}
            </Text>
            <TextInput
              value={email}
              onChange={setEmail}
              onSubmit={(value) => {
                if (value.trim()) {
                  setEmail(value.trim());
                  setPhase("resolving");
                }
              }}
            />
          </Box>
        </Box>
      )}

      {phase === "resolving" && (
        <Box flexDirection="column">
          <Text color="green">Name: {name}</Text>
          <Text color="green">Email: {email}</Text>
          <Box marginTop={1} gap={1}>
            {!resolvedInfo ? (
              <>
                <Text color="yellow">
                  <Spinner type="dots" />
                </Text>
                <Text color="yellow">
                  Resolving {name} across connected sources...
                </Text>
              </>
            ) : (
              <Box flexDirection="column">
                {resolvedInfo.resolved.map(({ source, detail }) => (
                  <Box key={source} gap={1}>
                    <Text color="green">✓</Text>
                    <Text>
                      {source}: <Text color="cyan">{detail}</Text>
                    </Text>
                  </Box>
                ))}
                {resolvedInfo.warnings.map((warning, i) => (
                  <Box key={i} gap={1}>
                    <Text color="yellow">!</Text>
                    <Text color="yellow">{warning}</Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {(phase === "generating" ||
        phase === "writing-log" ||
        phase === "prompt-continue" ||
        phase === "chat") &&
        resolvedInfo && (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="green">Peer: {name}</Text>
            {resolvedInfo.resolved.map(({ source, detail }) => (
              <Box key={source} gap={1}>
                <Text color="green">✓</Text>
                <Text>
                  {source}: <Text color="cyan">{detail}</Text>
                </Text>
              </Box>
            ))}
          </Box>
        )}

      {/* Tool status during log generation */}
      {(phase === "generating" || phase === "writing-log") &&
        tools.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {tools.map((tool, i) => {
              const label = formatToolName(tool.name);
              return (
                <Box key={`${tool.name}-${i}`} gap={1}>
                  {tool.status === "running" ? (
                    <>
                      <Text color="yellow">
                        <Spinner type="dots" />
                      </Text>
                      <Text color="yellow">{label}...</Text>
                    </>
                  ) : (
                    <>
                      <Text color="green">✓</Text>
                      <Text color="gray">{label}</Text>
                    </>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

      {phase === "generating" && tools.length === 0 && (
        <Box gap={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow">
            Gathering collaboration evidence between you and {name}...
          </Text>
        </Box>
      )}

      {phase === "writing-log" && (
        <Box flexDirection="column">
          <Box gap={1} marginBottom={1}>
            <Text color="magenta">
              <Spinner type="dots" />
            </Text>
            <Text color="magenta" bold>
              Writing collaboration log...
            </Text>
          </Box>
          <Text wrap="wrap">{collabLog}</Text>
        </Box>
      )}

      {phase === "prompt-continue" && (
        <Box flexDirection="column">
          <Text wrap="wrap">{collabLog}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">{"─".repeat(60)}</Text>
            {savedPath && <Text color="green">Saved to {savedPath}</Text>}
          </Box>
          <Box marginTop={1}>
            <Text color="cyan" bold>
              Want help writing the peer review? (y/n){" "}
            </Text>
            <TextInput
              value={continueInput}
              onChange={setContinueInput}
              onSubmit={handleContinueSubmit}
            />
          </Box>
        </Box>
      )}

      {phase === "chat" && (
        <Box flexDirection="column">
          <Text color="gray">
            Collaboration log saved — starting peer review chat.
          </Text>
          <Text color="gray">{"─".repeat(60)}</Text>

          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}

          <ToolStatus tools={chatActiveTools} />

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
      )}

      {phase === "error" && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}
    </Box>
  );
}
