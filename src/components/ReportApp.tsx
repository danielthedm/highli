import React, { useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import { Header } from "./Header.js";
import { getActiveSourceNames } from "../sources/registry.js";
import { generate, type GenerateMode } from "../report/generate.js";
import { writeManifest } from "../report/brag-state.js";
import { writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { format } from "date-fns";

interface ReportAppProps {
  timeframe: { from: string; to: string };
  mode?: GenerateMode;
  existingBrag?: string;
}

const MODE_CONFIG: Record<GenerateMode, { title: string; dir: string; prefix: string }> = {
  report: { title: "insights report", dir: "reports", prefix: "report" },
  brag: { title: "brag document", dir: "brags", prefix: "brag" },
  "brag-amend": { title: "brag document (amend)", dir: "brags", prefix: "brag" },
};

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

export function ReportApp({ timeframe, mode = "report", existingBrag }: ReportAppProps) {
  const { exit } = useApp();
  const sources = getActiveSourceNames();
  const config = MODE_CONFIG[mode];
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [reportText, setReportText] = useState("");
  const [phase, setPhase] = useState<"gathering" | "writing" | "done" | "error">("gathering");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generate(mode, timeframe, {
      onToolStart: (name) => {
        setTools((prev) => {
          // Mark any previously running tool as done
          const updated = prev.map((t) =>
            t.status === "running" ? { ...t, status: "done" as const } : t,
          );
          return [...updated, { name, status: "running", startedAt: Date.now() }];
        });
      },
      onToolDone: (name) => {
        setTools((prev) =>
          prev.map((t) =>
            t.name === name ? { ...t, status: "done" as const } : t,
          ),
        );
      },
      onTextDelta: (delta) => {
        setPhase("writing");
        setReportText((prev) => prev + delta);
      },
      onDone: async (fullText) => {
        // Mark all tools done
        setTools((prev) =>
          prev.map((t) => ({ ...t, status: "done" as const })),
        );

        // Save output
        const dir = join(homedir(), ".highli", config.dir);
        await mkdir(dir, { recursive: true });
        const filename = `${config.prefix}-${format(new Date(), "yyyy-MM-dd-HHmm")}.md`;
        const filePath = join(dir, filename);
        await writeFile(filePath, fullText, "utf-8");
        setSavedPath(filePath);

        // Save brag manifest for amend support
        if (mode === "brag" || mode === "brag-amend") {
          await writeManifest({
            lastRunDate: timeframe.to,
            lastFilePath: filePath,
          });
        }

        // Copy to clipboard
        try {
          const { default: clipboardy } = await import("clipboardy");
          await clipboardy.write(fullText);
        } catch {}

        setPhase("done");
        setTimeout(() => exit(), 500);
      },
      onError: (err) => {
        setError(err.message);
        setPhase("error");
        setTimeout(() => exit(), 2000);
      },
    }, { existingBrag });
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="magenta">
            highli
          </Text>
          <Text color="gray"> — {config.title}</Text>
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

      {/* Phase indicator */}
      {phase === "gathering" && tools.length === 0 && (
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
              <Text color="green">
                Saved to {savedPath}
              </Text>
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
