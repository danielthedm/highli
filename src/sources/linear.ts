import { tool } from "ai";
import { z } from "zod";
import { LinearClient } from "@linear/sdk";
import { defineSource } from "./registry.js";
import { formatSourceResult, type SourceResult } from "./types.js";
import { getConfig } from "../config/defaults.js";

const dateRange = {
  since: z.string().describe("Start date in YYYY-MM-DD format"),
  until: z.string().describe("End date in YYYY-MM-DD format"),
};

function getClient(): LinearClient {
  return new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
}

// ── API functions ───────────────────────────────────────────────────

async function getCompletedIssues(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const client = getClient();
  const me = await client.viewer;

  const issues = await client.issues({
    filter: {
      assignee: { id: { eq: me.id } },
      completedAt: {
        gte: new Date(params.since),
        lte: new Date(params.until),
      },
    },
    orderBy: "updatedAt" as any,
    first: 100,
  });

  const items = await Promise.all(
    issues.nodes.map(async (issue) => {
      const state = await issue.state;
      const project = await issue.project;
      return {
        title: `${issue.identifier}: ${issue.title}`,
        description: `${state?.name ?? "Done"}${project ? ` — Project: ${project.name}` : ""}${issue.estimate ? ` — ${issue.estimate} pts` : ""}`,
        date: issue.completedAt?.toISOString().split("T")[0] ?? "",
        url: issue.url,
        metrics: {
          ...(issue.estimate ? { points: issue.estimate } : {}),
        },
      };
    }),
  );

  const totalPoints = items.reduce(
    (sum, item) => sum + (item.metrics?.points ?? 0),
    0,
  );

  return {
    source: "Linear Issues Completed",
    summary: `Completed ${issues.nodes.length} issues (${totalPoints} points) from ${params.since} to ${params.until}`,
    items,
    totalCount: issues.nodes.length,
  };
}

async function getProjects(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const client = getClient();
  const me = await client.viewer;
  const teams = await me.teams();

  const allProjects: SourceResult["items"] = [];

  for (const team of teams.nodes) {
    const projects = await team.projects({
      filter: {
        updatedAt: {
          gte: new Date(params.since),
          lte: new Date(params.until),
        },
      },
      first: 50,
    });

    for (const project of projects.nodes) {
      const members = await project.members();
      const isMember = members.nodes.some((m) => m.id === me.id);
      if (!isMember) continue;

      allProjects.push({
        title: project.name,
        description: `${project.state} — ${Math.round(project.progress * 100)}% complete${project.targetDate ? ` — Target: ${project.targetDate}` : ""}`,
        date: project.updatedAt.toISOString().split("T")[0],
        url: project.url,
        metrics: { progress: Math.round(project.progress * 100) },
      });
    }
  }

  return {
    source: "Linear Projects",
    summary: `Contributing to ${allProjects.length} projects`,
    items: allProjects,
    totalCount: allProjects.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

export default defineSource({
  name: "Linear",
  envKey: "LINEAR_API_KEY",
  description: "Issues completed, project contributions, and cycle metrics",
  getUserContext: () => {
    const config = getConfig();
    if (!config.linear.teamId) return "";
    return `Linear team: ${config.linear.teamId}.`;
  },
  tools: {
    linear_get_completed_issues: tool({
      description:
        "Get issues completed by the user in a date range. Returns issue titles, projects, labels, and point estimates.",
      parameters: z.object(dateRange),
      execute: async (params) => formatSourceResult(await getCompletedIssues(params)),
    }),
    linear_get_projects: tool({
      description:
        "Get projects the user contributed to. Shows project name, status, and progress.",
      parameters: z.object(dateRange),
      execute: async (params) => formatSourceResult(await getProjects(params)),
    }),
  },
});
