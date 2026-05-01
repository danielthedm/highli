import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawn, execSync } from "child_process";
import {
  detectMethodsForSource,
  eventCount,
  eventsBetween,
  getDbPath,
  getSetting,
  ingestRange,
  setSetting,
  type Event,
  type IngestProgress,
} from "@highli/core";
import {
  generateForgottenInsight,
  INSIGHT_CONFIDENCE_THRESHOLD,
  type Insight,
} from "@highli/core/ai";
import { allSources } from "@highli/sources";

const ACCENT = "#c8a600";
const DIM = "gray";

type Phase =
  | "detect"
  | "linear-prompt"
  | "slack-prompt"
  | "pulling"
  | "insight"
  | "summary"
  | "background-prompt"
  | "done";

interface SetupSnapshot {
  github: { ok: boolean; method: "token" | "cli" | "none"; user?: string };
  linear: { ok: boolean; tokenSet: boolean };
  slack: { ok: boolean; tokenSet: boolean };
}

function isoToday(): string {
  return new Date().toISOString().split("T")[0];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function getGitHubUser(): string | undefined {
  try {
    return execSync("gh api user --jq .login", {
      encoding: "utf-8",
      timeout: 4000,
    }).trim();
  } catch {
    return undefined;
  }
}

function envFilePath(): string {
  return join(process.cwd(), ".env");
}

function writeEnvVar(key: string, value: string): void {
  const path = envFilePath();
  let content = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) {
    lines[idx] = `${key}=${value}`;
    content = lines.join("\n");
  } else {
    content = content.trimEnd();
    if (content.length > 0) content += "\n";
    content += `${key}=${value}\n`;
  }
  writeFileSync(path, content, "utf-8");
  process.env[key] = value;
}

interface SummaryStats {
  prsAuthored: number;
  prsAuthoredLarge: number;
  prsReviewed: number;
  primaryReviews: number;
  commits: number;
  repos: Set<string>;
}

function computeSummary(events: Event[]): SummaryStats {
  const repos = new Set<string>();
  let prsAuthored = 0;
  let prsAuthoredLarge = 0;
  let prsReviewed = 0;
  let primaryReviews = 0;
  let commits = 0;

  for (const e of events) {
    if (e.payload.repo && typeof e.payload.repo === "string") {
      repos.add(e.payload.repo);
    }
    if (e.type === "pr_authored") {
      prsAuthored++;
      // Heuristic: PRs with body length > ~2k chars often correspond to large
      // diffs. We don't have additions/deletions from search — rough proxy.
      const body = (e.payload.body as string | null) ?? "";
      if (body.length > 2000) prsAuthoredLarge++;
    } else if (e.type === "pr_reviewed") {
      prsReviewed++;
      // "Primary reviewer" heuristic — hard to know without the reviews API.
      // For build #1, we only count this when PR has very few reviewers
      // (data not in payload yet), so leave at 0.
    } else if (e.type === "commit") {
      commits++;
    }
  }

  return { prsAuthored, prsAuthoredLarge, prsReviewed, primaryReviews, commits, repos };
}

export function FirstSessionApp() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("detect");
  const [setup, setSetup] = useState<SetupSnapshot | null>(null);
  const [linearInput, setLinearInput] = useState("");
  const [slackInput, setSlackInput] = useState("");

  const [pullProgress, setPullProgress] = useState<IngestProgress[]>([]);
  const [pullDone, setPullDone] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightFailed, setInsightFailed] = useState(false);
  const [bgChoice, setBgChoice] = useState<"y" | "n" | null>(null);

  const since = isoDaysAgo(30);
  const until = isoToday();

  // ── Phase: detect ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "detect") return;
    const ghDetect = detectMethodsForSource("github");
    const ghUser = ghDetect.cli || ghDetect.token ? getGitHubUser() : undefined;

    const snap: SetupSnapshot = {
      github: {
        ok: ghDetect.cli || ghDetect.token,
        method: ghDetect.token ? "token" : ghDetect.cli ? "cli" : "none",
        user: ghUser,
      },
      linear: {
        ok: !!process.env.LINEAR_API_KEY,
        tokenSet: !!process.env.LINEAR_API_KEY,
      },
      slack: { ok: !!process.env.SLACK_TOKEN, tokenSet: !!process.env.SLACK_TOKEN },
    };
    setSetup(snap);

    // Non-interactive shells (e.g. piped stdin) — skip the optional prompts and
    // pull whatever the engineer already has wired up.
    const interactive = !!process.stdin.isTTY;

    if (interactive && !snap.linear.ok) {
      setPhase("linear-prompt");
    } else if (interactive && !snap.slack.ok) {
      setPhase("slack-prompt");
    } else {
      setPhase("pulling");
    }
  }, [phase]);

  // ── Phase: pulling ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "pulling") return;
    let cancelled = false;

    (async () => {
      try {
        await ingestRange(allSources, since, until, "30-day", (p) => {
          if (cancelled) return;
          setPullProgress((prev) => [...prev, p]);
        });
        if (cancelled) return;
        const recent = eventsBetween({ since, until });
        setEvents(recent);
        setPullDone(true);
        setPhase("insight");
      } catch (err: any) {
        if (cancelled) return;
        setPullError(err?.message ?? String(err));
        setPullDone(true);
        setPhase("insight");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, since, until]);

  // ── Phase: insight ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "insight") return;
    let cancelled = false;
    (async () => {
      try {
        const result = await generateForgottenInsight({ events, since, until });
        if (cancelled) return;
        setInsight(result);
      } catch {
        if (cancelled) return;
        setInsightFailed(true);
      } finally {
        if (!cancelled) setPhase("summary");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, events, since, until]);

  // Move from summary -> background-prompt automatically (gives reader a beat).
  // In non-interactive shells, skip the prompt entirely.
  useEffect(() => {
    if (phase !== "summary") return;
    const t = setTimeout(() => {
      if (!process.stdin.isTTY) {
        setBgChoice("n");
        setPhase("done");
      } else {
        setPhase("background-prompt");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Phase: background-prompt — handle Y/N ─────────────────────────
  // useInput requires raw mode on stdin; only attach when a TTY is available.
  useInput(
    (input, key) => {
      if (phase === "background-prompt") {
        if (input === "y" || input === "Y" || key.return) {
          setBgChoice("y");
          startBackgroundPull();
          setPhase("done");
        } else if (input === "n" || input === "N") {
          setBgChoice("n");
          setPhase("done");
        }
      }
    },
    { isActive: !!process.stdin.isTTY },
  );

  function startBackgroundPull() {
    const logDir = join(homedir(), ".highli", "logs");
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, "full-pull.log");
    const child = spawn(
      process.execPath,
      [process.argv[1], "pull-history", "--log", logPath],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    setSetting("background_pull_started_at", String(Date.now()));
  }

  useEffect(() => {
    if (phase !== "done") return;
    setSetting("first_run_completed_at", String(Date.now()));
    const t = setTimeout(() => exit(), 100);
    return () => clearTimeout(t);
  }, [phase, exit]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={ACCENT}>
          highli
        </Text>
        <Text color={DIM}> career narrative for engineers</Text>
        <Text color={DIM}>{"─".repeat(45)}</Text>
        <Text color={DIM}>Quick setup: 30 sec, no signup.</Text>
      </Box>

      {setup && (
        <Box flexDirection="column" marginBottom={1}>
          <SetupLine
            ok={setup.github.ok}
            label="GitHub"
            detail={
              setup.github.method === "cli"
                ? `using your gh CLI session${setup.github.user ? ` (${setup.github.user})` : ""}`
                : setup.github.method === "token"
                  ? `using GITHUB_TOKEN${setup.github.user ? ` (${setup.github.user})` : ""}`
                  : "no token, no gh session — set GITHUB_TOKEN or run `gh auth login`"
            }
          />
          {phase !== "linear-prompt" && (
            <SetupLine
              ok={setup.linear.ok}
              label="Linear"
              detail={
                setup.linear.tokenSet ? "API key set" : "skipped"
              }
            />
          )}
          {phase !== "slack-prompt" &&
            phase !== "linear-prompt" && (
              <SetupLine
                ok={setup.slack.ok}
                label="Slack"
                detail={
                  setup.slack.tokenSet ? "token set" : "skipped"
                }
              />
            )}
        </Box>
      )}

      {phase === "linear-prompt" && (
        <Box marginBottom={1}>
          <Text color={DIM}>? Linear API key (skip for now): </Text>
          <TextInput
            value={linearInput}
            onChange={setLinearInput}
            mask="*"
            onSubmit={(value) => {
              if (value.trim()) {
                writeEnvVar("LINEAR_API_KEY", value.trim());
                setSetup((s) =>
                  s
                    ? { ...s, linear: { ok: true, tokenSet: true } }
                    : s,
                );
              }
              setLinearInput("");
              if (!setup?.slack.ok) {
                setPhase("slack-prompt");
              } else {
                setPhase("pulling");
              }
            }}
          />
        </Box>
      )}

      {phase === "slack-prompt" && (
        <Box marginBottom={1}>
          <Text color={DIM}>? Slack token (skip for now): </Text>
          <TextInput
            value={slackInput}
            onChange={setSlackInput}
            mask="*"
            onSubmit={(value) => {
              if (value.trim()) {
                writeEnvVar("SLACK_TOKEN", value.trim());
                setSetup((s) =>
                  s ? { ...s, slack: { ok: true, tokenSet: true } } : s,
                );
              }
              setSlackInput("");
              setPhase("pulling");
            }}
          />
        </Box>
      )}

      {(phase === "pulling" || phase === "insight" || phase === "summary" || phase === "background-prompt" || phase === "done") && (
        <PullSection
          since={since}
          until={until}
          progress={pullProgress}
          done={pullDone}
          error={pullError}
        />
      )}

      {(phase === "insight" || phase === "summary" || phase === "background-prompt" || phase === "done") && pullDone && (
        <SummarySection
          events={events}
          insight={insight}
          insightFailed={insightFailed}
          insightInProgress={phase === "insight"}
        />
      )}

      {phase === "background-prompt" && (
        <Box marginTop={1}>
          <Text color={DIM}>Pull your full history in the background? [Y/n] </Text>
        </Box>
      )}

      {phase === "done" && (
        <Box flexDirection="column" marginTop={1}>
          {bgChoice === "y" && (
            <Text color={DIM}>
              <Text color={ACCENT}>→</Text> Background pull started. Logs:{" "}
              {join(homedir(), ".highli", "logs", "full-pull.log")}
            </Text>
          )}
          <Text color={DIM}>
            <Text color={ACCENT}>→</Text> Local store: {getDbPath()} ({eventCount()} events)
          </Text>
        </Box>
      )}
    </Box>
  );
}

function SetupLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <Box>
      <Text color={ok ? ACCENT : DIM}>{ok ? "✓" : "○"} </Text>
      <Text bold={ok}>{label}: </Text>
      <Text color={DIM}>{detail}</Text>
    </Box>
  );
}

function PullSection({
  since,
  until,
  progress,
  done,
  error,
}: {
  since: string;
  until: string;
  progress: IngestProgress[];
  done: boolean;
  error: string | null;
}) {
  const sourceCount = new Set(progress.map((p) => p.source)).size;
  const completed = progress.filter(
    (p) => p.status === "done" || p.status === "error" || p.status === "skip",
  ).length;
  // Track started sources to estimate progress, capped at the number of
  // ingest-capable sources (currently 1 — GitHub).
  const total = Math.max(1, sourceCount);
  const pct = done ? 100 : Math.round((completed / total) * 100);
  const filled = Math.round((pct / 100) * 40);
  const bar = "━".repeat(filled) + " ".repeat(40 - filled);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={DIM}>Pulling your last 30 days </Text>
        <Text color={DIM} dimColor>
          ({since} to {until})
        </Text>
        <Text color={DIM}>...</Text>
      </Box>
      <Box>
        {!done && <Spinner type="dots" />}
        <Text color={ACCENT}> {bar}</Text>
        <Text color={DIM}> {pct}%</Text>
      </Box>
      {progress
        .filter((p) => p.status !== "start")
        .map((p, i) => (
          <Box key={`${p.source}-${i}`}>
            <Text color={p.status === "error" ? "red" : ACCENT}>
              {p.status === "error" ? "✗" : p.status === "skip" ? "○" : "✓"}{" "}
            </Text>
            <Text>{p.source}</Text>
            <Text color={DIM}>
              {p.status === "skip"
                ? " — skipped"
                : p.status === "error"
                  ? ` — ${p.error}`
                  : ` — ${p.inserted ?? 0} events`}
            </Text>
          </Box>
        ))}
      {error && (
        <Text color="red">
          ✗ {error}
        </Text>
      )}
    </Box>
  );
}

function SummarySection({
  events,
  insight,
  insightFailed,
  insightInProgress,
}: {
  events: Event[];
  insight: Insight | null;
  insightFailed: boolean;
  insightInProgress: boolean;
}) {
  const stats = computeSummary(events);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={ACCENT} bold>
        Here's what I found:
      </Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text color={ACCENT}>{stats.prsAuthored}</Text>
          <Text color={DIM}>
            {" "}
            PR{stats.prsAuthored === 1 ? "" : "s"} authored
            {stats.prsAuthoredLarge > 0
              ? ` — ${stats.prsAuthoredLarge} of these were sizeable`
              : ""}
          </Text>
        </Text>
        <Text>
          <Text color={ACCENT}>{stats.prsReviewed}</Text>
          <Text color={DIM}>
            {" "}
            PR{stats.prsReviewed === 1 ? "" : "s"} reviewed
          </Text>
        </Text>
        <Text>
          <Text color={ACCENT}>{stats.commits}</Text>
          <Text color={DIM}>
            {" "}
            commit{stats.commits === 1 ? "" : "s"} across {stats.repos.size} repo{stats.repos.size === 1 ? "" : "s"}
          </Text>
        </Text>
      </Box>

      {insightInProgress && (
        <Box marginTop={1} marginLeft={2}>
          <Spinner type="dots" />
          <Text color={DIM}> reading the last 30 days for one thing worth surfacing…</Text>
        </Box>
      )}

      {!insightInProgress && insight && insight.confidence >= INSIGHT_CONFIDENCE_THRESHOLD && (
        <InsightCallout insight={insight} events={events} />
      )}

      {!insightInProgress && insight && insight.confidence < INSIGHT_CONFIDENCE_THRESHOLD && (
        <Box marginTop={1} marginLeft={2}>
          <Text color={DIM} dimColor>
            (no single item stood out this period; nothing surfaced.)
          </Text>
        </Box>
      )}

      {insightFailed && (
        <Box marginTop={1} marginLeft={2}>
          <Text color={DIM} dimColor>(insight pass failed; data is saved locally.)</Text>
        </Box>
      )}
    </Box>
  );
}

function InsightCallout({ insight, events }: { insight: Insight; events: Event[] }) {
  const matched = insight.eventId
    ? events.find((e) => e.id === insight.eventId)
    : undefined;
  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Text color={ACCENT} bold>
        1 thing you probably forgot:
      </Text>
      <Box marginLeft={2} flexDirection="column">
        <Text bold color={ACCENT}>
          → {insight.callout}
        </Text>
        {matched?.url && (
          <Text color={DIM} dimColor>
            {matched.url}
          </Text>
        )}
        <Text color={DIM} dimColor>
          {insight.reasoning}
        </Text>
      </Box>
    </Box>
  );
}
