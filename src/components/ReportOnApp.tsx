import React, { useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { getActiveSourceNames } from "../sources/registry.js";
import { generate } from "../report/generate.js";
import { resolveIdentity } from "../report/resolve-identity.js";
import { setTargetUser } from "../report/target-user.js";
import type { TargetUser } from "../report/target-user.js";
import { writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { format } from "date-fns";

interface ReportOnAppProps {
  timeframe: { from: string; to: string };
  name?: string;
  email?: string;
}

type Phase =
  | "input-name"
  | "input-email"
  | "resolving"
  | "generating"
  | "writing"
  | "done"
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

export function ReportOnApp({ timeframe, name: initialName, email: initialEmail }: ReportOnAppProps) {
  const { exit } = useApp();
  const sources = getActiveSourceNames();

  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [resolvedInfo, setResolvedInfo] = useState<{
    resolved: { source: string; detail: string }[];
    warnings: string[];
  } | null>(null);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [reportText, setReportText] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Determine starting phase based on provided props
  const [phase, setPhase] = useState<Phase>(() => {
    if (initialName && initialEmail) return "resolving";
    if (initialName) return "input-email";
    return "input-name";
  });

  // Run identity resolution when entering resolving phase
  useEffect(() => {
    if (phase !== "resolving") return;

    resolveIdentity(name, email).then(({ targetUser, resolved, warnings }) => {
      setResolvedInfo({ resolved, warnings });
      setTargetUser(targetUser);

      // Brief pause to show resolution results, then start generating
      setTimeout(() => {
        startGeneration(targetUser);
      }, 1000);
    });
  }, [phase]);

  function startGeneration(targetUser: TargetUser) {
    setPhase("generating");

    generate("report-on", timeframe, {
      onToolStart: (toolName) => {
        setTools((prev) => {
          const updated = prev.map((t) =>
            t.status === "running" ? { ...t, status: "done" as const } : t,
          );
          return [...updated, { name: toolName, status: "running", startedAt: Date.now() }];
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
        setPhase("writing");
        setReportText((prev) => prev + delta);
      },
      onDone: async (fullText) => {
        setTools((prev) =>
          prev.map((t) => ({ ...t, status: "done" as const })),
        );

        // Save output
        const dir = join(homedir(), ".highli", "report-on");
        await mkdir(dir, { recursive: true });
        const filename = `report-on-${format(new Date(), "yyyy-MM-dd-HHmm")}.md`;
        const filePath = join(dir, filename);
        await writeFile(filePath, fullText, "utf-8");
        setSavedPath(filePath);

        // Copy to clipboard
        try {
          const { default: clipboardy } = await import("clipboardy");
          await clipboardy.write(fullText);
        } catch {}

        setTargetUser(null);
        setPhase("done");
        setTimeout(() => exit(), 500);
      },
      onError: (err) => {
        setTargetUser(null);
        setError(err.message);
        setPhase("error");
        setTimeout(() => exit(), 2000);
      },
    }, { targetUser });
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="magenta">
            highli
          </Text>
          <Text color="gray"> — direct report</Text>
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

      {/* Name input phase */}
      {phase === "input-name" && (
        <Box>
          <Text color="cyan" bold>
            Direct report's name:{" "}
          </Text>
          <TextInput
            value={name}
            onChange={setName}
            onSubmit={(value) => {
              if (value.trim()) {
                setName(value.trim());
                if (initialEmail) {
                  setPhase("resolving");
                } else {
                  setPhase("input-email");
                }
              }
            }}
          />
        </Box>
      )}

      {/* Email input phase */}
      {phase === "input-email" && (
        <Box flexDirection="column">
          <Text color="green">
            Name: {name}
          </Text>
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

      {/* Resolving phase */}
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

      {/* Generating / tool status */}
      {(phase === "generating" || phase === "writing" || phase === "done") && (
        <Box flexDirection="column">
          <Text color="green">Name: {name}</Text>
          <Text color="green">Email: {email}</Text>
          {resolvedInfo && (
            <Box flexDirection="column" marginBottom={1}>
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
        </Box>
      )}

      {/* Tool status */}
      {tools.length > 0 && (
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

      {/* Phase indicators */}
      {phase === "generating" && tools.length === 0 && (
        <Box gap={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow">Starting data collection...</Text>
        </Box>
      )}

      {phase === "writing" && (
        <Box flexDirection="column">
          <Box gap={1} marginBottom={1}>
            <Text color="magenta">
              <Spinner type="dots" />
            </Text>
            <Text color="magenta" bold>
              Writing report...
            </Text>
          </Box>
          <Text wrap="wrap">{reportText}</Text>
        </Box>
      )}

      {phase === "done" && (
        <Box flexDirection="column">
          <Text wrap="wrap">{reportText}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">{"─".repeat(60)}</Text>
            {savedPath && (
              <Text color="green">Saved to {savedPath}</Text>
            )}
            <Text color="green">Copied to clipboard</Text>
          </Box>
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
