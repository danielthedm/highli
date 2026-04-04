import { tool } from "ai";
import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { defineSource } from "./registry.js";
import { formatSourceResult, type SourceResult } from "./types.js";

interface HistoryEntry {
  display: string;
  pastedContents: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}

const HISTORY_PATH = join(homedir(), ".claude", "history.jsonl");

async function readHistory(): Promise<HistoryEntry[]> {
  const raw = await readFile(HISTORY_PATH, "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryEntry);
}

function projectName(fullPath: string): string {
  return fullPath.split("/").pop() ?? fullPath;
}

function filterByDate(
  entries: HistoryEntry[],
  since: string,
  until: string,
): HistoryEntry[] {
  const start = new Date(since).getTime();
  const end = new Date(until + "T23:59:59").getTime();
  return entries.filter((e) => e.timestamp >= start && e.timestamp <= end);
}

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : "0%";
}

// ── Analysis functions ─────────────────────────────────────────────

async function getUsageSummary(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const all = await readHistory();
  const entries = filterByDate(all, params.since, params.until);

  const byProject = new Map<string, number>();
  for (const e of entries) {
    const name = projectName(e.project);
    byProject.set(name, (byProject.get(name) ?? 0) + 1);
  }

  const byDay = new Map<string, number>();
  for (const e of entries) {
    const day = new Date(e.timestamp).toISOString().split("T")[0];
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const byHour = new Array(24).fill(0);
  for (const e of entries) {
    byHour[new Date(e.timestamp).getHours()]++;
  }
  const peakHour = byHour.indexOf(Math.max(...byHour));

  const byDow = new Array(7).fill(0);
  const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const e of entries) {
    byDow[new Date(e.timestamp).getDay()]++;
  }
  const peakDow = dowNames[byDow.indexOf(Math.max(...byDow))];

  const sessions = new Set(entries.map((e) => e.sessionId));

  const avgLen = entries.length
    ? Math.round(
        entries.reduce((sum, e) => sum + e.display.length, 0) / entries.length,
      )
    : 0;

  const topProjects = [...byProject.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const items = topProjects.map(([name, count]) => ({
    title: name,
    description: `${count} prompts`,
    date: "",
    metrics: { prompts: count },
  }));

  const days = [...byDay.values()];
  const avgPerDay = days.length
    ? Math.round(days.reduce((a, b) => a + b, 0) / days.length)
    : 0;
  const maxDay = Math.max(...days, 0);

  return {
    source: "Claude Code Usage Summary",
    summary: [
      `${entries.length} total prompts across ${sessions.size} sessions and ${byProject.size} projects (${params.since} to ${params.until}).`,
      `Average ${avgPerDay} prompts/day (peak: ${maxDay}). Average prompt length: ${avgLen} chars.`,
      `Peak usage: ${peakDow}s at ${peakHour}:00.`,
      `Active days: ${byDay.size}.`,
    ].join(" "),
    items,
    totalCount: entries.length,
  };
}

async function getProjectBreakdown(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const all = await readHistory();
  const entries = filterByDate(all, params.since, params.until);

  const projects = new Map<
    string,
    { prompts: number; sessions: Set<string>; first: number; last: number }
  >();

  for (const e of entries) {
    const name = projectName(e.project);
    const existing = projects.get(name) ?? {
      prompts: 0,
      sessions: new Set<string>(),
      first: Infinity,
      last: 0,
    };
    existing.prompts++;
    existing.sessions.add(e.sessionId);
    existing.first = Math.min(existing.first, e.timestamp);
    existing.last = Math.max(existing.last, e.timestamp);
    projects.set(name, existing);
  }

  const sorted = [...projects.entries()].sort(
    (a, b) => b[1].prompts - a[1].prompts,
  );

  const items = sorted.slice(0, 30).map(([name, data]) => ({
    title: name,
    description: `${data.prompts} prompts across ${data.sessions.size} sessions. Active: ${new Date(data.first).toISOString().split("T")[0]} to ${new Date(data.last).toISOString().split("T")[0]}`,
    date: new Date(data.last).toISOString().split("T")[0],
    metrics: { prompts: data.prompts, sessions: data.sessions.size },
  }));

  return {
    source: "Claude Code Project Breakdown",
    summary: `Used Claude across ${projects.size} projects. Top project: ${sorted[0]?.[0] ?? "none"} with ${sorted[0]?.[1]?.prompts ?? 0} prompts.`,
    items,
    totalCount: projects.size,
  };
}

// ── Prompt effectiveness analysis ──────────────────────────────────

async function getPromptEffectiveness(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const all = await readHistory();
  const entries = filterByDate(all, params.since, params.until);
  const total = entries.length;
  if (!total) {
    return {
      source: "Claude Code Prompt Effectiveness",
      summary: "No prompts found in this date range.",
      items: [],
      totalCount: 0,
    };
  }

  // ── Slash commands & skills usage ────────────────────────────────
  const slashCommands = entries.filter((e) =>
    e.display.trim().startsWith("/"),
  );
  const skillCounts = new Map<string, number>();
  for (const e of slashCommands) {
    const cmd = e.display.trim().split(/\s/)[0];
    // Filter out file paths that start with /
    if (cmd.includes(".") || cmd.length > 30) continue;
    skillCounts.set(cmd, (skillCounts.get(cmd) ?? 0) + 1);
  }
  const topSkills = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const totalSkillUses = topSkills.reduce((s, [, c]) => s + c, 0);

  // ── Prompt sophistication scoring ────────────────────────────────
  let fileRefs = 0;
  let constraints = 0;
  let examples = 0;
  let acceptanceCriteria = 0;
  let multiInstruction = 0;
  let withPaste = 0;
  let withUrls = 0;
  let withScreenshots = 0;

  // ── Usage categories ─────────────────────────────────────────────
  let debugging = 0;
  let codeGen = 0;
  let testing = 0;
  let codeReview = 0;
  let explaining = 0;
  let refactoring = 0;
  let styling = 0;
  let deployment = 0;

  // ── Prompt style ─────────────────────────────────────────────────
  let vagueStarters = 0;
  let directInstructions = 0;
  let yesNo = 0;
  let singleWord = 0;

  // ── Sample buckets for the report ────────────────────────────────
  const highQualityExamples: string[] = [];
  const lowQualityExamples: string[] = [];

  for (const e of entries) {
    const text = e.display;
    const lower = text.toLowerCase().trim();
    const len = text.length;

    // Sophistication signals
    if (/\.(ts|tsx|js|jsx|py|go|rs|css|html|json|md|yaml|yml)\b/.test(text) || /src\//.test(text))
      fileRefs++;
    if (/\b(don't|do not|must not|should not|never |make sure|ensure )\b/i.test(text))
      constraints++;
    if (/\b(for example|e\.g\.|like this|such as|here'?s an example)\b/i.test(lower))
      examples++;
    if (/\b(it should|expected|the result should|acceptance|criteria)\b/i.test(lower))
      acceptanceCriteria++;
    if (text.split(/[.!]\s/).length >= 3 || text.split("\n").length >= 3)
      multiInstruction++;
    if (Object.keys(e.pastedContents).length > 0) withPaste++;
    if (/https?:\/\//.test(text)) withUrls++;
    if (/screenshot|\.png|\.jpg|\.jpeg|\.gif|image/i.test(lower))
      withScreenshots++;

    // Usage categories
    if (/\b(error|bug|fix|broken|not working|crash|fail|issue|debug)\b/i.test(lower))
      debugging++;
    if (/\b(create|build|add|implement|write|generate|scaffold|new )\b/i.test(lower))
      codeGen++;
    if (/\b(test|spec|jest|vitest|cypress|playwright|expect\(|assert)\b/i.test(lower))
      testing++;
    if (/\b(review|code review|look over|check my|audit)\b/i.test(lower))
      codeReview++;
    if (/\b(explain|what does|how does|walk me through|why does|what is)\b/i.test(lower))
      explaining++;
    if (/\b(refactor|clean up|simplify|reorganize|extract|restructure)\b/i.test(lower))
      refactoring++;
    if (/\b(style|css|tailwind|design|layout|color|font|ui |ux )\b/i.test(lower))
      styling++;
    if (/\b(deploy|ci|cd|docker|kubernetes|vercel|aws|infra)\b/i.test(lower))
      deployment++;

    // Prompt style
    if (/^(can you|could you|please |help me|i need you to|i want you to|i'd like)/i.test(lower))
      vagueStarters++;
    if (/^(add |fix |create |update |remove |change |implement |build |make |write |set up|configure |delete |move |rename |replace )/i.test(lower))
      directInstructions++;
    if (/^(yes|no|y|n|yeah|yep|nah|nope|ok|sure|correct|right|exactly|perfect|looks good|lgtm|do it|go ahead)\b/i.test(lower))
      yesNo++;
    if (lower.split(/\s+/).length <= 2 && len < 20) singleWord++;

    // Sample high/low quality
    if (len > 200 && constraints > 0 && highQualityExamples.length < 5) {
      highQualityExamples.push(text.substring(0, 150) + "...");
    }
    if (len < 5 && len > 0 && lowQualityExamples.length < 10) {
      lowQualityExamples.push(text);
    }
  }

  // ── Sophistication score (0-100) ─────────────────────────────────
  const sophisticationFactors = [
    Math.min(fileRefs / total, 0.15) / 0.15,           // file references
    Math.min(constraints / total, 0.1) / 0.1,          // constraints
    Math.min(examples / total, 0.05) / 0.05,           // examples
    Math.min(acceptanceCriteria / total, 0.05) / 0.05, // acceptance criteria
    Math.min(multiInstruction / total, 0.3) / 0.3,     // multi-instruction
    Math.min(withPaste / total, 0.1) / 0.1,            // pasted content
    1 - Math.min(singleWord / total, 0.3) / 0.3,       // penalty for single-word
    1 - Math.min(yesNo / total, 0.3) / 0.3,            // penalty for yes/no
  ];
  const sophisticationScore = Math.round(
    (sophisticationFactors.reduce((a, b) => a + b, 0) / sophisticationFactors.length) * 100,
  );

  // ── Usage diversity score (0-100) ────────────────────────────────
  const categories = [debugging, codeGen, testing, codeReview, explaining, refactoring, styling, deployment];
  const usedCategories = categories.filter((c) => c > 0).length;
  const diversityScore = Math.round((usedCategories / categories.length) * 100);

  // ── Build items ──────────────────────────────────────────────────
  const items = [
    {
      title: "Prompt Sophistication Score",
      description: `${sophisticationScore}/100. File refs: ${pct(fileRefs, total)}, constraints: ${pct(constraints, total)}, examples given: ${pct(examples, total)}, multi-step instructions: ${pct(multiInstruction, total)}, pasted content: ${pct(withPaste, total)}`,
      date: "",
    },
    {
      title: "Usage Diversity Score",
      description: `${diversityScore}/100 (${usedCategories}/8 categories used). Code generation: ${codeGen}, debugging: ${debugging}, testing: ${testing}, code review: ${codeReview}, explaining: ${explaining}, refactoring: ${refactoring}, styling: ${styling}, deployment: ${deployment}`,
      date: "",
    },
    {
      title: "Prompt Style Breakdown",
      description: `Direct instructions ("add X", "fix Y"): ${directInstructions} (${pct(directInstructions, total)}). Vague starters ("can you", "please"): ${vagueStarters} (${pct(vagueStarters, total)}). Yes/no responses: ${yesNo} (${pct(yesNo, total)}). Single-word prompts: ${singleWord} (${pct(singleWord, total)})`,
      date: "",
    },
    {
      title: "Slash Commands & Skills",
      description: totalSkillUses
        ? `${totalSkillUses} skill invocations. ${topSkills.map(([cmd, count]) => `${cmd}: ${count}`).join(", ")}`
        : "No slash commands or skills used. Skills like /review, /test, /commit can speed up common workflows.",
      date: "",
    },
    {
      title: "Context Provision",
      description: `URLs shared: ${withUrls} (${pct(withUrls, total)}). Screenshots/images: ${withScreenshots} (${pct(withScreenshots, total)}). File paths referenced: ${fileRefs} (${pct(fileRefs, total)}). Content pasted: ${withPaste} (${pct(withPaste, total)})`,
      date: "",
    },
    {
      title: "Underused Capabilities",
      description: [
        codeReview < 5 ? "Code review (only asked " + codeReview + " times — try 'review this file for bugs')" : null,
        refactoring < 10 ? "Refactoring (" + refactoring + " requests — Claude excels at restructuring code)" : null,
        testing < 20 ? "Testing (" + testing + " requests — try 'write tests for this module')" : null,
        explaining < 10 ? "Explanations (" + explaining + " requests — useful for unfamiliar codebases)" : null,
        totalSkillUses < 20 ? "Skills/slash commands (only " + totalSkillUses + " uses — /commit, /review save time)" : null,
        withPaste / total < 0.03 ? "Pasting context (only " + pct(withPaste, total) + " — paste error logs, specs, docs)" : null,
      ]
        .filter(Boolean)
        .join(". ") || "Good coverage across capabilities!",
      date: "",
    },
  ];

  if (lowQualityExamples.length > 0) {
    items.push({
      title: "Sample Low-Context Prompts",
      description: `These prompts had minimal context: ${lowQualityExamples.map((p) => `"${p}"`).join(", ")}. Adding what/why/where makes Claude's output significantly better.`,
      date: "",
    });
  }

  return {
    source: "Claude Code Prompt Effectiveness",
    summary: `Sophistication score: ${sophisticationScore}/100. Diversity score: ${diversityScore}/100. ${pct(directInstructions, total)} direct instructions, ${pct(yesNo, total)} yes/no responses, ${totalSkillUses} skill uses. Most prompts are ${codeGen > debugging ? "code generation" : "debugging"}-focused.`,
    items,
    totalCount: total,
  };
}

// ── Session patterns analysis ──────────────────────────────────────

async function getSessionPatterns(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const all = await readHistory();
  const entries = filterByDate(all, params.since, params.until);

  // Group by session
  const sessions = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const existing = sessions.get(e.sessionId) ?? [];
    existing.push(e);
    sessions.set(e.sessionId, existing);
  }

  const totalSessions = sessions.size;
  if (!totalSessions) {
    return {
      source: "Claude Code Session Patterns",
      summary: "No sessions found in this date range.",
      items: [],
      totalCount: 0,
    };
  }

  // Session length distribution
  let singlePrompt = 0;
  let shortSessions = 0;
  let mediumSessions = 0;
  let longSessions = 0;
  let marathonSessions = 0;
  let abandonedSessions = 0;

  // Session quality
  let productiveSessions = 0;    // sessions with mix of detailed + follow-up prompts
  let rapidFireSessions = 0;     // >50% short prompts (under 20 chars)
  let contextRichSessions = 0;   // sessions with file refs or pasted content

  const sessionDetails: { project: string; prompts: number; quality: string }[] = [];

  for (const [, sessionEntries] of sessions) {
    const n = sessionEntries.length;
    if (n === 1) {
      singlePrompt++;
      // Check if it was a real abandoned session or just a one-off
      if (sessionEntries[0].display.length < 30) abandonedSessions++;
    } else if (n <= 5) shortSessions++;
    else if (n <= 20) mediumSessions++;
    else if (n <= 50) longSessions++;
    else marathonSessions++;

    const shortCount = sessionEntries.filter((e) => e.display.length < 20).length;
    const hasFileRefs = sessionEntries.some((e) => /\.(ts|js|py|go|css)\b|src\//.test(e.display));
    const hasPaste = sessionEntries.some((e) => Object.keys(e.pastedContents).length > 0);
    const hasDetailedPrompts = sessionEntries.some((e) => e.display.length > 100);

    if (n > 3 && shortCount / n > 0.5) rapidFireSessions++;
    if (hasFileRefs || hasPaste) contextRichSessions++;
    if (hasDetailedPrompts && n > 3) productiveSessions++;

    if (n >= 20) {
      const quality = shortCount / n > 0.5 ? "rapid-fire" : hasDetailedPrompts ? "productive" : "mixed";
      sessionDetails.push({
        project: projectName(sessionEntries[0].project),
        prompts: n,
        quality,
      });
    }
  }

  const avgPromptsPerSession = Math.round(entries.length / totalSessions);

  // Session duration analysis
  const durations: number[] = [];
  for (const [, sessionEntries] of sessions) {
    if (sessionEntries.length < 2) continue;
    const first = sessionEntries[0].timestamp;
    const last = sessionEntries[sessionEntries.length - 1].timestamp;
    durations.push((last - first) / 1000 / 60); // minutes
  }
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Sort session details by prompts
  sessionDetails.sort((a, b) => b.prompts - a.prompts);

  const items = [
    {
      title: "Session Length Distribution",
      description: `Single prompt: ${singlePrompt} (${pct(singlePrompt, totalSessions)}), Short (2-5): ${shortSessions} (${pct(shortSessions, totalSessions)}), Medium (6-20): ${mediumSessions} (${pct(mediumSessions, totalSessions)}), Long (21-50): ${longSessions} (${pct(longSessions, totalSessions)}), Marathon (50+): ${marathonSessions} (${pct(marathonSessions, totalSessions)})`,
      date: "",
    },
    {
      title: "Session Quality",
      description: `Productive (detailed prompts + good flow): ${productiveSessions} (${pct(productiveSessions, totalSessions)}). Rapid-fire (>50% short prompts): ${rapidFireSessions} (${pct(rapidFireSessions, totalSessions)}). Context-rich (file refs or pasted content): ${contextRichSessions} (${pct(contextRichSessions, totalSessions)}). Abandoned (single short prompt): ${abandonedSessions}`,
      date: "",
    },
    {
      title: "Session Efficiency",
      description: `Average ${avgPromptsPerSession} prompts/session. Average session duration: ${avgDuration} minutes. ${pct(singlePrompt, totalSessions)} of sessions are single-prompt (could indicate quick tasks OR abandoned attempts).`,
      date: "",
    },
  ];

  if (sessionDetails.length > 0) {
    items.push({
      title: "Longest Sessions",
      description: sessionDetails
        .slice(0, 8)
        .map((s) => `${s.project}: ${s.prompts} prompts (${s.quality})`)
        .join(", "),
      date: "",
    });
  }

  if (marathonSessions > 5) {
    items.push({
      title: "Marathon Session Insight",
      description: `${marathonSessions} sessions exceeded 50 prompts. Very long sessions can indicate scope creep or lack of upfront planning. Consider breaking large tasks into focused sessions or using /plan at the start.`,
      date: "",
    });
  }

  return {
    source: "Claude Code Session Patterns",
    summary: `${totalSessions} sessions. Average ${avgPromptsPerSession} prompts/session, ${avgDuration} min duration. ${pct(productiveSessions, totalSessions)} productive, ${pct(rapidFireSessions, totalSessions)} rapid-fire.`,
    items,
    totalCount: totalSessions,
  };
}

// ── Weekly trend ───────────────────────────────────────────────────

async function getWeeklyTrend(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const all = await readHistory();
  const entries = filterByDate(all, params.since, params.until);

  const byWeek = new Map<string, { prompts: number; projects: Set<string>; sessions: Set<string> }>();

  for (const e of entries) {
    const d = new Date(e.timestamp);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff)).toISOString().split("T")[0];

    const existing = byWeek.get(weekStart) ?? {
      prompts: 0,
      projects: new Set<string>(),
      sessions: new Set<string>(),
    };
    existing.prompts++;
    existing.projects.add(projectName(e.project));
    existing.sessions.add(e.sessionId);
    byWeek.set(weekStart, existing);
  }

  const sorted = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const items = sorted.map(([week, data]) => ({
    title: `Week of ${week}`,
    description: `${data.prompts} prompts, ${data.projects.size} projects, ${data.sessions.size} sessions`,
    date: week,
    metrics: {
      prompts: data.prompts,
      projects: data.projects.size,
      sessions: data.sessions.size,
    },
  }));

  return {
    source: "Claude Code Weekly Trend",
    summary: `${sorted.length} weeks of data. Average ${entries.length ? Math.round(entries.length / sorted.length) : 0} prompts/week.`,
    items,
    totalCount: sorted.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

function isAvailable(): boolean {
  return existsSync(HISTORY_PATH);
}

export default defineSource({
  name: "Claude Code",
  configKey: "claudeLogs",
  envKey: "__CLAUDE_LOGS_ALWAYS_CHECK__",
  description:
    "Chat history analysis — prompt effectiveness, skill usage, session patterns, and actionable tips for getting more value from Claude",
  isAvailable,
  getUserContext: () =>
    `Claude Code history path: ${HISTORY_PATH}`,
  tools: {
    claude_usage_summary: tool({
      description:
        "Get a high-level summary of Claude Code usage — total prompts, sessions, projects, peak times, and averages.",
      parameters: z.object({
        since: z.string().describe("Start date in YYYY-MM-DD format"),
        until: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (params) =>
        formatSourceResult(await getUsageSummary(params)),
    }),
    claude_project_breakdown: tool({
      description:
        "Get a per-project breakdown of Claude Code usage — prompts, sessions, and active date ranges for each project.",
      parameters: z.object({
        since: z.string().describe("Start date in YYYY-MM-DD format"),
        until: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (params) =>
        formatSourceResult(await getProjectBreakdown(params)),
    }),
    claude_prompt_effectiveness: tool({
      description:
        "Deep analysis of prompt quality and effectiveness. Scores prompt sophistication (file refs, constraints, examples, acceptance criteria). Analyzes usage diversity (code gen vs debugging vs testing vs review). Detects slash command and skill usage patterns. Identifies underused capabilities. Samples low-context prompts. This is the primary tool for generating Claude usage improvement tips.",
      parameters: z.object({
        since: z.string().describe("Start date in YYYY-MM-DD format"),
        until: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (params) =>
        formatSourceResult(await getPromptEffectiveness(params)),
    }),
    claude_session_patterns: tool({
      description:
        "Analyze session patterns — session length distribution, productive vs rapid-fire sessions, abandoned sessions, marathon sessions, and session efficiency metrics.",
      parameters: z.object({
        since: z.string().describe("Start date in YYYY-MM-DD format"),
        until: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (params) =>
        formatSourceResult(await getSessionPatterns(params)),
    }),
    claude_weekly_trend: tool({
      description:
        "Get week-by-week Claude Code usage trend — prompts, projects, and sessions per week.",
      parameters: z.object({
        since: z.string().describe("Start date in YYYY-MM-DD format"),
        until: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (params) =>
        formatSourceResult(await getWeeklyTrend(params)),
    }),
  },
});
