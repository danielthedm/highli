import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { existsSync, readFileSync, writeFileSync } from "fs";
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

type Phase = "select-sources" | "configure" | "enter-token" | "enter-github-org" | "provider" | "enter-api-key" | "done";

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
  envKey: string;
}

// ── .env helpers ───────────────────────────────────────────────────

function getEnvPath(): string {
  return join(process.cwd(), ".env");
}

function writeEnvVar(key: string, value: string): void {
  const envPath = getEnvPath();
  let content = "";

  if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf-8");
  }

  const lines = content.split("\n");
  const existingIndex = lines.findIndex((l) => l.startsWith(`${key}=`) || l.startsWith(`${key} =`));

  if (existingIndex >= 0) {
    lines[existingIndex] = `${key}=${value}`;
    content = lines.join("\n");
  } else {
    content = content.trimEnd();
    if (content.length > 0) content += "\n";
    content += `${key}=${value}\n`;
  }

  writeFileSync(envPath, content, "utf-8");
  // Update process.env so the rest of this session picks it up
  process.env[key] = value;
}

// ── Build source entries ───────────────────────────────────────────

const SOURCE_ENV_KEYS: Record<string, string> = {
  GitHub: "GITHUB_TOKEN",
  Linear: "LINEAR_API_KEY",
  Slack: "SLACK_TOKEN",
  Notion: "NOTION_TOKEN",
};

function buildSourceEntries(): SourceEntry[] {
  return allSources.map((source) => {
    const detected = detectMethodsForSource(source.name);
    const options: MethodOption[] = [];
    const envKey = SOURCE_ENV_KEYS[source.name] ?? source.envKey ?? "";

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
        options.push({
          key: "token",
          label: `${envKey}${detected.token ? " (set)" : ""}`,
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
      envKey,
    };
  });
}

// ── Provider options ───────────────────────────────────────────────

interface ProviderOption {
  key: string;
  label: string;
  detected: boolean;
  envKey: string;
}

function getProviderOptions(): ProviderOption[] {
  return [
    {
      key: "anthropic",
      label: `Anthropic${process.env.ANTHROPIC_API_KEY ? " (API key set)" : ""}`,
      detected: !!process.env.ANTHROPIC_API_KEY,
      envKey: "ANTHROPIC_API_KEY",
    },
    {
      key: "openai",
      label: `OpenAI${process.env.OPENAI_API_KEY ? " (API key set)" : ""}`,
      detected: !!process.env.OPENAI_API_KEY,
      envKey: "OPENAI_API_KEY",
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

  // GitHub org entry phase
  const [orgInput, setOrgInput] = useState("");
  const [pendingGithubAdvance, setPendingGithubAdvance] = useState<{
    configKey: string;
    method: string;
  } | null>(null);

  // Token entry phase
  const [tokenInput, setTokenInput] = useState("");
  const [tokenContext, setTokenContext] = useState<{
    envKey: string;
    sourceName: string;
    configKey: string;
    method: string;
    nextAction: () => void;
  } | null>(null);

  // Phase 3: provider
  const [providerChoice, setProviderChoice] = useState<string | null>(null);

  // API key entry phase
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyContext, setApiKeyContext] = useState<{
    provider: string;
    envKey: string;
  } | null>(null);

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

  function advanceConfigStep(configKey: string, method: string) {
    setChoices((prev) => new Map(prev).set(configKey, method));
    if (configStepIndex < selectedSources.length - 1) {
      setConfigStepIndex((prev) => prev + 1);
      setPhase("configure");
    } else {
      setPhase("provider");
    }
  }

  function finishWithProvider(provider: string) {
    setProviderChoice(provider);
    const finalChoices = new Map(choices);
    saveConfig(finalChoices, selected, sourceEntries, provider);
    setPhase("done");
    setTimeout(() => exit(), 800);
  }

  useInput((input, key) => {
    // Text input phases are handled by TextInput component
    if (phase === "enter-token" || phase === "enter-api-key") return;
    if (phase === "done") return;

    // ── Source selection phase ──────────────────────────────────────
    if (phase === "select-sources") {
      const itemCount = sourceEntries.length + 1; // +1 for "Continue" button
      if (key.upArrow) {
        setCursorIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
      } else if (key.downArrow) {
        setCursorIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
      } else if (input === " " && cursorIndex < sourceEntries.length) {
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
        // If token method and not yet set, prompt for it
        if (choice.method === "token" && !choice.detected && step.envKey) {
          setTokenInput("");
          setTokenContext({
            envKey: step.envKey,
            sourceName: step.name,
            configKey: step.configKey,
            method: choice.method,
            nextAction: () => advanceConfigStep(step.configKey, choice.method),
          });
          setPhase("enter-token");
        } else if (step.configKey === "github") {
          // Ask for work org before advancing
          setOrgInput("");
          setPendingGithubAdvance({ configKey: step.configKey, method: choice.method });
          setPhase("enter-github-org");
        } else {
          advanceConfigStep(step.configKey, choice.method);
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
        // If API key not set, prompt for it
        if (!choice.detected) {
          setApiKeyInput("");
          setApiKeyContext({ provider: choice.key, envKey: choice.envKey });
          setPhase("enter-api-key");
        } else {
          // Also write the provider to .env
          writeEnvVar("AI_PROVIDER", choice.key);
          finishWithProvider(choice.key);
        }
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

    for (const [configKey, method] of sourceChoices) {
      const existing = config[configKey as keyof HighliConfig] as any;
      setConfig(configKey as keyof HighliConfig, {
        ...existing,
        method,
      });
    }

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
                  <Text color={isCursor ? "white" : "gray"} bold={isCursor}>
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

      {/* ── Token entry ────────────────────────────────────────────── */}
      {phase === "enter-token" && tokenContext && (
        <Box flexDirection="column">
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
          <Box flexDirection="column" marginTop={configStepIndex > 0 ? 1 : 0}>
            <Box gap={1} marginBottom={1}>
              <Text color="cyan" bold>
                {tokenContext.sourceName}
              </Text>
              <Text color="gray">— enter API token</Text>
            </Box>
            <Box gap={1} marginBottom={1}>
              <Text color="gray">{tokenContext.envKey}:</Text>
              <TextInput
                value={tokenInput}
                onChange={setTokenInput}
                mask="*"
                onSubmit={(value) => {
                  if (value.trim()) {
                    writeEnvVar(tokenContext.envKey, value.trim());
                  }
                  tokenContext.nextAction();
                  setTokenContext(null);
                  setTokenInput("");
                }}
              />
            </Box>
            <Text color="gray" dimColor>
              Enter to save → .env  |  Leave blank and Enter to skip
            </Text>
          </Box>
        </Box>
      )}

      {/* ── GitHub org entry ──────────────────────────────────────── */}
      {phase === "enter-github-org" && pendingGithubAdvance && (
        <Box flexDirection="column">
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
          <Box flexDirection="column" marginTop={configStepIndex > 0 ? 1 : 0}>
            <Box gap={1} marginBottom={1}>
              <Text color="cyan" bold>GitHub</Text>
              <Text color="gray">— work organization</Text>
            </Box>
            <Box gap={1} marginBottom={1}>
              <Text color="gray">Org name (e.g. acme-corp):</Text>
              <TextInput
                value={orgInput}
                onChange={setOrgInput}
                onSubmit={(value) => {
                  if (value.trim()) {
                    const config = getConfig();
                    setConfig("github", { ...config.github, orgs: [value.trim()] });
                  }
                  advanceConfigStep(
                    pendingGithubAdvance.configKey,
                    pendingGithubAdvance.method,
                  );
                  setPendingGithubAdvance(null);
                  setOrgInput("");
                }}
              />
            </Box>
            <Text color="gray" dimColor>
              Enter to save  |  Leave blank to search all orgs
            </Text>
          </Box>
        </Box>
      )}

      {/* ── Phase 3: AI Provider ──────────────────────────────────── */}
      {phase === "provider" && (
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

      {/* ── API key entry ──────────────────────────────────────────── */}
      {phase === "enter-api-key" && apiKeyContext && (
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

          <Box flexDirection="column" marginTop={1}>
            <Box gap={1} marginBottom={1}>
              <Text color="cyan" bold>
                {apiKeyContext.provider === "anthropic" ? "Anthropic" : "OpenAI"}
              </Text>
              <Text color="gray">— enter API key</Text>
            </Box>
            <Box gap={1} marginBottom={1}>
              <Text color="gray">{apiKeyContext.envKey}:</Text>
              <TextInput
                value={apiKeyInput}
                onChange={setApiKeyInput}
                mask="*"
                onSubmit={(value) => {
                  if (value.trim()) {
                    writeEnvVar(apiKeyContext.envKey, value.trim());
                  }
                  writeEnvVar("AI_PROVIDER", apiKeyContext.provider);
                  finishWithProvider(apiKeyContext.provider);
                  setApiKeyContext(null);
                  setApiKeyInput("");
                }}
              />
            </Box>
            <Text color="gray" dimColor>
              Enter to save → .env  |  Leave blank and Enter to skip
            </Text>
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
