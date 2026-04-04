import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { allSources } from "../sources/registry.js";
import { getConfig, setConfig } from "../config/defaults.js";
import type { HighliConfig } from "../config/schema.js";
import {
  detectMethodsForSource,
  isClaudeCliAvailable,
} from "../sources/claude-mcp.js";

// ── Types ──────────────────────────────────────────────────────────

type Phase = "select-sources" | "configure" | "provider" | "done";

interface MethodOption {
  key: string;
  label: string;
  detected: boolean;
  method: string;
}

interface SourceEntry {
  name: string;
  configKey: string;
  description: string;
  options: MethodOption[];
}

// ── Build source entries ───────────────────────────────────────────

function buildSourceEntries(): SourceEntry[] {
  return allSources.map((source) => {
    const detected = detectMethodsForSource(source.name);
    const options: MethodOption[] = [];

    if (source.name === "Claude Code") {
      const historyExists = existsSync(
        join(homedir(), ".claude", "history.jsonl"),
      );
      options.push({
        key: "auto",
        label: `Auto-detect${historyExists ? " (history found)" : " (no history)"}`,
        detected: historyExists,
        method: "auto",
      });
    } else {
      if (source.name === "GitHub") {
        options.push({
          key: "token",
          label: `GITHUB_TOKEN${detected.token ? " (set)" : ""}`,
          detected: detected.token,
          method: "token",
        });
        options.push({
          key: "cli",
          label: `gh CLI${detected.cli ? " (authenticated)" : " (not found)"}`,
          detected: detected.cli,
          method: "cli",
        });
      } else {
        const envName =
          source.name === "Linear"
            ? "LINEAR_API_KEY"
            : source.name === "Slack"
              ? "SLACK_TOKEN"
              : source.name === "Notion"
                ? "NOTION_TOKEN"
                : source.envKey;
        options.push({
          key: "token",
          label: `${envName}${detected.token ? " (set)" : ""}`,
          detected: detected.token,
          method: "token",
        });
      }

      options.push({
        key: "claude-mcp",
        label: `Claude MCP${detected.claudeMcp ? " (server detected)" : " (no server)"}`,
        detected: detected.claudeMcp,
        method: "claude-mcp",
      });
    }

    return {
      name: source.name,
      configKey: source.configKey,
      description: source.description,
      options,
    };
  });
}

// ── Provider options ───────────────────────────────────────────────

interface ProviderOption {
  key: string;
  label: string;
  detected: boolean;
}

function getProviderOptions(): ProviderOption[] {
  return [
    {
      key: "anthropic",
      label: `Anthropic${process.env.ANTHROPIC_API_KEY ? " (API key set)" : ""}`,
      detected: !!process.env.ANTHROPIC_API_KEY,
    },
    {
      key: "openai",
      label: `OpenAI${process.env.OPENAI_API_KEY ? " (API key set)" : ""}`,
      detected: !!process.env.OPENAI_API_KEY,
    },
  ];
}

// ── Main wizard ────────────────────────────────────────────────────

export function SetupWizard() {
  const { exit } = useApp();
  const sourceEntries = buildSourceEntries();
  const providerOptions = getProviderOptions();
  const claudeAvailable = isClaudeCliAvailable();

  const [phase, setPhase] = useState<Phase>("select-sources");
  const [cursorIndex, setCursorIndex] = useState(0);

  // Phase 1: source selection (checkboxes)
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Pre-select sources that have any detected access method
    const preselected = new Set<string>();
    for (const entry of sourceEntries) {
      if (entry.options.some((o) => o.detected && o.key !== "skip")) {
        preselected.add(entry.configKey);
      }
    }
    return preselected;
  });

  // Phase 2: per-source config
  const [configStepIndex, setConfigStepIndex] = useState(0);
  const [choices, setChoices] = useState<Map<string, string>>(new Map());
  const selectedSources = sourceEntries.filter((s) =>
    selected.has(s.configKey),
  );

  // Phase 3: provider
  const [providerChoice, setProviderChoice] = useState<string | null>(null);

  // Reset cursor when phase changes
  useEffect(() => {
    if (phase === "configure") {
      const step = selectedSources[configStepIndex];
      if (step) {
        const firstDetected = step.options.findIndex((o) => o.detected);
        setCursorIndex(firstDetected >= 0 ? firstDetected : 0);
      }
    } else if (phase === "provider") {
      const firstDetected = providerOptions.findIndex((o) => o.detected);
      setCursorIndex(firstDetected >= 0 ? firstDetected : 0);
    } else if (phase === "select-sources") {
      setCursorIndex(0);
    }
  }, [phase, configStepIndex]);

  useInput((input, key) => {
    if (phase === "done") return;

    // ── Source selection phase ──────────────────────────────────────
    if (phase === "select-sources") {
      const itemCount = sourceEntries.length + 1; // +1 for "Continue" button
      if (key.upArrow) {
        setCursorIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
      } else if (key.downArrow) {
        setCursorIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
      } else if (input === " " && cursorIndex < sourceEntries.length) {
        // Toggle selection
        const entry = sourceEntries[cursorIndex];
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(entry.configKey)) {
            next.delete(entry.configKey);
          } else {
            next.add(entry.configKey);
          }
          return next;
        });
      } else if (key.return) {
        if (cursorIndex === sourceEntries.length || selected.size > 0) {
          // Move to configure phase (or provider if nothing selected)
          if (selectedSources.length > 0) {
            setConfigStepIndex(0);
            setPhase("configure");
          } else {
            setPhase("provider");
          }
        }
      } else if (key.escape) {
        exit();
      }
      return;
    }

    // ── Configure phase ────────────────────────────────────────────
    if (phase === "configure") {
      const step = selectedSources[configStepIndex];
      const optionCount = step.options.length;

      if (key.upArrow) {
        setCursorIndex((prev) => (prev > 0 ? prev - 1 : optionCount - 1));
      } else if (key.downArrow) {
        setCursorIndex((prev) => (prev < optionCount - 1 ? prev + 1 : 0));
      } else if (key.return) {
        const choice = step.options[cursorIndex];
        setChoices((prev) => new Map(prev).set(step.configKey, choice.method));

        if (configStepIndex < selectedSources.length - 1) {
          setConfigStepIndex((prev) => prev + 1);
        } else {
          setPhase("provider");
        }
      } else if (key.escape) {
        exit();
      }
      return;
    }

    // ── Provider phase ─────────────────────────────────────────────
    if (phase === "provider") {
      if (key.upArrow) {
        setCursorIndex((prev) =>
          prev > 0 ? prev - 1 : providerOptions.length - 1,
        );
      } else if (key.downArrow) {
        setCursorIndex((prev) =>
          prev < providerOptions.length - 1 ? prev + 1 : 0,
        );
      } else if (key.return) {
        const choice = providerOptions[cursorIndex];
        setProviderChoice(choice.key);
        saveConfig(choices, selected, sourceEntries, choice.key);
        setPhase("done");
        setTimeout(() => exit(), 500);
      } else if (key.escape) {
        exit();
      }
    }
  });

  function saveConfig(
    sourceChoices: Map<string, string>,
    selectedKeys: Set<string>,
    allEntries: SourceEntry[],
    provider: string,
  ) {
    const config = getConfig();

    // Set chosen methods for selected sources
    for (const [configKey, method] of sourceChoices) {
      const existing = config[configKey as keyof HighliConfig] as any;
      setConfig(configKey as keyof HighliConfig, {
        ...existing,
        method,
      });
    }

    // Set skip for unselected sources
    for (const entry of allEntries) {
      if (!selectedKeys.has(entry.configKey) && !sourceChoices.has(entry.configKey)) {
        const existing = config[entry.configKey as keyof HighliConfig] as any;
        setConfig(entry.configKey as keyof HighliConfig, {
          ...existing,
          method: "skip",
        });
      }
    }

    setConfig("ai", {
      ...config.ai,
      provider: provider as "anthropic" | "openai",
    });
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="magenta">
            highli
          </Text>
          <Text color="gray"> — setup wizard</Text>
        </Box>
        <Text color="gray">{"─".repeat(60)}</Text>
      </Box>

      {/* Environment info */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">
          Claude CLI:{" "}
          {claudeAvailable ? (
            <Text color="green">available</Text>
          ) : (
            <Text color="red">not found</Text>
          )}
        </Text>
      </Box>

      {/* ── Phase 1: Source selection ──────────────────────────────── */}
      {phase === "select-sources" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Which data sources do you want to connect?</Text>
          </Box>
          <Text color="gray" dimColor>
            Space to toggle, Enter to continue
          </Text>
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            {sourceEntries.map((entry, i) => {
              const isChecked = selected.has(entry.configKey);
              const isCursor = cursorIndex === i;
              const hasDetected = entry.options.some(
                (o) => o.detected && o.key !== "skip",
              );

              return (
                <Box key={entry.configKey} gap={1}>
                  <Text color={isCursor ? "cyan" : "gray"}>
                    {isCursor ? "❯" : " "}
                  </Text>
                  <Text color={isChecked ? "green" : "gray"}>
                    {isChecked ? "[✓]" : "[ ]"}
                  </Text>
                  <Text
                    color={isCursor ? "white" : "gray"}
                    bold={isCursor}
                  >
                    {entry.name}
                  </Text>
                  <Text color="gray" dimColor>
                    — {entry.description}
                  </Text>
                  {hasDetected && (
                    <Text color="green" dimColor>
                      {" "}
                      (ready)
                    </Text>
                  )}
                </Box>
              );
            })}

            {/* Continue button */}
            <Box marginTop={1}>
              <Text color={cursorIndex === sourceEntries.length ? "cyan" : "gray"}>
                {cursorIndex === sourceEntries.length ? "❯" : " "}
              </Text>
              <Text
                color={cursorIndex === sourceEntries.length ? "white" : "gray"}
                bold={cursorIndex === sourceEntries.length}
              >
                {" "}
                Continue ({selected.size} selected)
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Phase 2: Configure each selected source ───────────────── */}
      {phase === "configure" && (
        <Box flexDirection="column">
          {/* Show previous config choices */}
          {selectedSources.slice(0, configStepIndex).map((step) => {
            const method = choices.get(step.configKey) ?? "auto";
            return (
              <Box key={step.configKey} gap={1}>
                <Text color="green">✓</Text>
                <Text>{step.name}</Text>
                <Text color="gray">→ {method}</Text>
              </Box>
            );
          })}

          {/* Current source config */}
          {configStepIndex < selectedSources.length && (
            <Box flexDirection="column" marginTop={configStepIndex > 0 ? 1 : 0}>
              <Box gap={1} marginBottom={1}>
                <Text color="cyan" bold>
                  {selectedSources[configStepIndex].name}
                </Text>
                <Text color="gray">
                  ({configStepIndex + 1}/{selectedSources.length})
                </Text>
              </Box>
              <Text color="gray" dimColor>
                Select access method (↑↓ to move, Enter to select):
              </Text>
              <Box flexDirection="column" marginLeft={2}>
                {selectedSources[configStepIndex].options.map((opt, i) => {
                  const isSelected = i === cursorIndex;
                  const icon = opt.detected ? "✓" : "✗";
                  const iconColor = opt.detected ? "green" : "red";
                  return (
                    <Box key={opt.key} gap={1}>
                      <Text color={isSelected ? "cyan" : "gray"}>
                        {isSelected ? "❯" : " "}
                      </Text>
                      <Text color={iconColor}>{icon}</Text>
                      <Text
                        color={isSelected ? "white" : "gray"}
                        bold={isSelected}
                      >
                        {opt.label}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* ── Phase 3: AI Provider ──────────────────────────────────── */}
      {phase === "provider" && (
        <Box flexDirection="column">
          {/* Show all source choices */}
          {selectedSources.map((step) => {
            const method = choices.get(step.configKey) ?? "auto";
            return (
              <Box key={step.configKey} gap={1}>
                <Text color="green">✓</Text>
                <Text>{step.name}</Text>
                <Text color="gray">→ {method}</Text>
              </Box>
            );
          })}
          {sourceEntries
            .filter((s) => !selected.has(s.configKey))
            .map((step) => (
              <Box key={step.configKey} gap={1}>
                <Text color="gray">○</Text>
                <Text color="gray">{step.name}</Text>
                <Text color="gray">→ skip</Text>
              </Box>
            ))}

          <Box flexDirection="column" marginTop={1}>
            <Box gap={1} marginBottom={1}>
              <Text color="cyan" bold>
                AI Provider
              </Text>
            </Box>
            <Text color="gray" dimColor>
              Select AI provider (↑↓ to move, Enter to select):
            </Text>
            <Box flexDirection="column" marginLeft={2}>
              {providerOptions.map((opt, i) => {
                const isSelected = i === cursorIndex;
                return (
                  <Box key={opt.key} gap={1}>
                    <Text color={isSelected ? "cyan" : "gray"}>
                      {isSelected ? "❯" : " "}
                    </Text>
                    <Text color={opt.detected ? "green" : "red"}>
                      {opt.detected ? "✓" : "✗"}
                    </Text>
                    <Text
                      color={isSelected ? "white" : "gray"}
                      bold={isSelected}
                    >
                      {opt.label}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Done ──────────────────────────────────────────────────── */}
      {phase === "done" && (
        <Box flexDirection="column">
          {selectedSources.map((step) => {
            const method = choices.get(step.configKey) ?? "auto";
            return (
              <Box key={step.configKey} gap={1}>
                <Text color="green">✓</Text>
                <Text>{step.name}</Text>
                <Text color="gray">→ {method}</Text>
              </Box>
            );
          })}
          {sourceEntries
            .filter((s) => !selected.has(s.configKey))
            .map((step) => (
              <Box key={step.configKey} gap={1}>
                <Text color="gray">○</Text>
                <Text color="gray">{step.name}</Text>
                <Text color="gray">→ skip</Text>
              </Box>
            ))}
          <Box gap={1}>
            <Text color="green">✓</Text>
            <Text>AI Provider</Text>
            <Text color="gray">→ {providerChoice}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">{"─".repeat(60)}</Text>
          </Box>
          <Text color="green" bold>
            Setup complete! Run `highli review` to start.
          </Text>
        </Box>
      )}
    </Box>
  );
}
