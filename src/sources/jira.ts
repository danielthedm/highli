import { tool } from "ai";
import { z } from "zod";
import { defineSource, getSourceMethod } from "./registry.js";
import { formatSourceResult, type SourceResult } from "./types.js";
import { claudeMcpQuery } from "./claude-mcp.js";
import { getTargetUser } from "../report/target-user.js";

const dateRange = {
  since: z.string().describe("Start date in YYYY-MM-DD format"),
  until: z.string().describe("End date in YYYY-MM-DD format"),
};

function getAuth(): { baseUrl: string; headers: Record<string, string> } {
  const baseUrl = (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL ?? "";
  const token = process.env.JIRA_TOKEN ?? "";
  return {
    baseUrl,
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
}

// ── API functions ───────────────────────────────────────────────────

async function getCompletedIssues(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const { baseUrl, headers } = getAuth();
  const target = getTargetUser();
  const assignee = target?.email
    ? `assignee = "${target.email}"`
    : "assignee = currentUser()";

  const jql = `${assignee} AND statusCategory = Done AND updated >= "${params.since}" AND updated <= "${params.until}" ORDER BY updated DESC`;

  const allItems: SourceResult["items"] = [];
  let startAt = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/rest/api/3/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jql,
        maxResults: 100,
        startAt,
        fields: [
          "summary",
          "status",
          "issuetype",
          "project",
          "updated",
          "customfield_10016",
        ],
      }),
    });
    const data = await res.json();

    for (const issue of data.issues ?? []) {
      const points = issue.fields?.customfield_10016;
      allItems.push({
        title: `${issue.key}: ${issue.fields?.summary ?? ""}`,
        description: `${issue.fields?.issuetype?.name ?? ""} — ${issue.fields?.project?.name ?? ""} — ${issue.fields?.status?.name ?? "Done"}`,
        date: (issue.fields?.updated ?? "").split("T")[0],
        url: `${baseUrl}/browse/${issue.key}`,
        metrics: points ? { points } : undefined,
      });
    }

    startAt += (data.issues ?? []).length;
    if (startAt >= (data.total ?? 0) || startAt >= 1000) break;
  }

  const totalPoints = allItems.reduce(
    (sum, item) => sum + (item.metrics?.points ?? 0),
    0,
  );

  return {
    source: "Jira Issues Completed",
    summary: `Completed ${allItems.length} issues (${totalPoints} story points) from ${params.since} to ${params.until}`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getSprintContributions(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const { baseUrl, headers } = getAuth();
  const target = getTargetUser();
  const assignee = target?.email
    ? `assignee = "${target.email}"`
    : "assignee = currentUser()";

  const jql = `${assignee} AND sprint in openSprints() AND updated >= "${params.since}" AND updated <= "${params.until}" ORDER BY updated DESC`;

  const res = await fetch(`${baseUrl}/rest/api/3/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jql,
      maxResults: 100,
      fields: ["summary", "status", "sprint", "issuetype", "project", "updated"],
    }),
  });
  const data = await res.json();

  const items = (data.issues ?? []).map((issue: any) => ({
    title: `${issue.key}: ${issue.fields?.summary ?? ""}`,
    description: `${issue.fields?.issuetype?.name ?? ""} — ${issue.fields?.status?.name ?? ""}`,
    date: (issue.fields?.updated ?? "").split("T")[0],
    url: `${baseUrl}/browse/${issue.key}`,
  }));

  return {
    source: "Jira Sprint Contributions",
    summary: `${items.length} issues in active sprints (${params.since} to ${params.until})`,
    items,
    totalCount: items.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "Jira",
  configKey: "jira",
  envKey: "JIRA_TOKEN",
  description: "Issues completed, sprint contributions, and epics owned",
  tools: {
    jira_get_completed_issues: tool({
      description:
        "Get Jira issues completed by the user in a date range. Returns issue keys, summaries, types, and story points.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} completed Jira issues from ${params.since} to ${params.until}. For each include: issue key, summary, type, project, status, and story points. Format as a markdown list.`,
          );
        }
        return formatSourceResult(await getCompletedIssues(params));
      },
    }),
    jira_get_sprint_contributions: tool({
      description:
        "Get the user's contributions to active sprints. Shows issues assigned in current sprints.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name} (email: ${target.email})` : "I";
          return claudeMcpQuery(
            `List the Jira sprint issues assigned to ${who} from ${params.since} to ${params.until}. Include: issue key, summary, status, and sprint name. Format as markdown.`,
          );
        }
        return formatSourceResult(await getSprintContributions(params));
      },
    }),
  },
});

export default source;
