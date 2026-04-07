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

const API_BASE = "https://app.asana.com/api/1.0";

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.ASANA_TOKEN ?? ""}`,
    Accept: "application/json",
  };
}

// ── API functions ───────────────────────────────────────────────────

async function getCompletedTasks(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();
  const target = getTargetUser();

  // Get the user's info to find their workspace
  let assignee = "me";
  if (target?.asana?.userId) assignee = target.asana.userId;

  const meRes = await fetch(`${API_BASE}/users/me`, { headers });
  const meData = await meRes.json();
  const workspaces: any[] = meData.data?.workspaces ?? [];

  const allItems: SourceResult["items"] = [];

  for (const ws of workspaces) {
    const searchParams = new URLSearchParams({
      assignee,
      workspace: ws.gid,
      completed_since: params.since,
      opt_fields: "name,completed_at,projects.name,permalink_url,memberships.section.name",
    });

    const res = await fetch(`${API_BASE}/tasks?${searchParams}`, { headers });
    const data = await res.json();

    for (const task of data.data ?? []) {
      const completedDate = (task.completed_at ?? "").split("T")[0];
      if (completedDate > params.until) continue;

      const projectNames = (task.projects ?? [])
        .map((p: any) => p.name)
        .join(", ");

      allItems.push({
        title: task.name,
        description: projectNames ? `Project: ${projectNames}` : `Workspace: ${ws.name}`,
        date: completedDate,
        url: task.permalink_url,
      });
    }

    if (allItems.length >= 500) break;
  }

  return {
    source: "Asana Tasks Completed",
    summary: `Completed ${allItems.length} tasks (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getProjects(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();

  const meRes = await fetch(`${API_BASE}/users/me`, { headers });
  const meData = await meRes.json();
  const workspaces: any[] = meData.data?.workspaces ?? [];

  const allItems: SourceResult["items"] = [];

  for (const ws of workspaces) {
    const searchParams = new URLSearchParams({
      workspace: ws.gid,
      opt_fields: "name,current_status,modified_at,permalink_url",
    });

    const res = await fetch(`${API_BASE}/projects?${searchParams}`, { headers });
    const data = await res.json();

    for (const project of data.data ?? []) {
      const modified = (project.modified_at ?? "").split("T")[0];
      if (modified < params.since || modified > params.until) continue;

      allItems.push({
        title: project.name,
        description: project.current_status?.text ?? "Active",
        date: modified,
        url: project.permalink_url,
      });
    }
  }

  return {
    source: "Asana Projects",
    summary: `Contributing to ${allItems.length} projects (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "Asana",
  configKey: "asana",
  envKey: "ASANA_TOKEN",
  description: "Tasks completed and projects contributed to",
  tools: {
    asana_get_completed_tasks: tool({
      description:
        "Get Asana tasks completed by the user in a date range. Returns task names, projects, and completion dates.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} completed Asana tasks from ${params.since} to ${params.until}. Include: task name, project, and completion date. Format as markdown.`,
          );
        }
        return formatSourceResult(await getCompletedTasks(params));
      },
    }),
    asana_get_projects: tool({
      description:
        "Get Asana projects the user contributed to. Shows project name, status, and activity.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name} (email: ${target.email})` : "I";
          return claudeMcpQuery(
            `List the Asana projects ${who} contributed to from ${params.since} to ${params.until}. Include project name and status. Format as markdown.`,
          );
        }
        return formatSourceResult(await getProjects(params));
      },
    }),
  },
});

export default source;
