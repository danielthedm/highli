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

function getBaseUrl(): string {
  const site = process.env.DATADOG_SITE ?? "datadoghq.com";
  return `https://api.${site}`;
}

function getHeaders(): Record<string, string> {
  return {
    "DD-API-KEY": process.env.DATADOG_API_KEY ?? "",
    "DD-APPLICATION-KEY": process.env.DATADOG_APP_KEY ?? "",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// ── API functions ───────────────────────────────────────────────────

async function getDashboards(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const target = getTargetUser();

  const res = await fetch(`${baseUrl}/api/v1/dashboard`, { headers });
  const data = await res.json();

  const dashboards = (data.dashboards ?? []).filter((d: any) => {
    const modified = d.modified_at
      ? new Date(d.modified_at).toISOString().split("T")[0]
      : "";
    return modified >= params.since && modified <= params.until;
  });

  // Filter by author if target specified
  const filtered = target?.email
    ? dashboards.filter((d: any) => d.author_handle === target.email)
    : dashboards;

  const items = filtered.map((d: any) => ({
    title: d.title ?? "Untitled Dashboard",
    description: `Author: ${d.author_handle ?? "unknown"} — ${d.layout_type ?? "ordered"}`,
    date: d.modified_at
      ? new Date(d.modified_at).toISOString().split("T")[0]
      : "",
    url: `https://app.${process.env.DATADOG_SITE ?? "datadoghq.com"}/dashboard/${d.id}`,
  }));

  return {
    source: "Datadog Dashboards",
    summary: `${items.length} dashboards created/modified (${params.since} to ${params.until})`,
    items,
    totalCount: items.length,
  };
}

async function getMonitors(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const target = getTargetUser();

  const res = await fetch(`${baseUrl}/api/v1/monitor`, { headers });
  const data = await res.json();
  const monitors = Array.isArray(data) ? data : [];

  const filtered = monitors.filter((m: any) => {
    const modified = m.modified
      ? new Date(m.modified).toISOString().split("T")[0]
      : "";
    const inRange = modified >= params.since && modified <= params.until;
    if (!inRange) return false;
    if (target?.email) return m.creator?.handle === target.email;
    return true;
  });

  const items = filtered.map((m: any) => ({
    title: m.name ?? "Untitled Monitor",
    description: `Type: ${m.type ?? "unknown"} — ${m.overall_state ?? "OK"}`,
    date: m.modified
      ? new Date(m.modified).toISOString().split("T")[0]
      : "",
    url: `https://app.${process.env.DATADOG_SITE ?? "datadoghq.com"}/monitors/${m.id}`,
  }));

  return {
    source: "Datadog Monitors",
    summary: `${items.length} monitors created/modified (${params.since} to ${params.until})`,
    items,
    totalCount: items.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "Datadog",
  configKey: "datadog",
  envKey: "DATADOG_API_KEY",
  description: "Dashboards created and monitors configured",
  tools: {
    datadog_get_dashboards: tool({
      description:
        "Get Datadog dashboards created or modified in a date range.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} Datadog dashboards modified from ${params.since} to ${params.until}. Include dashboard title, author, and type. Format as markdown.`,
          );
        }
        return formatSourceResult(await getDashboards(params));
      },
    }),
    datadog_get_monitors: tool({
      description:
        "Get Datadog monitors created or modified in a date range.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} Datadog monitors modified from ${params.since} to ${params.until}. Include monitor name, type, and status. Format as markdown.`,
          );
        }
        return formatSourceResult(await getMonitors(params));
      },
    }),
  },
});

export default source;
