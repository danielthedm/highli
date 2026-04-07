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

const API_BASE = "https://api.pagerduty.com";

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Token token=${process.env.PAGERDUTY_TOKEN ?? ""}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// ── API functions ───────────────────────────────────────────────────

async function getIncidents(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();
  const target = getTargetUser();

  // Get current user ID for filtering
  let userId: string | undefined;
  if (target?.pagerduty?.userId) {
    userId = target.pagerduty.userId;
  } else {
    const meRes = await fetch(`${API_BASE}/users/me`, { headers });
    const meData = await meRes.json();
    userId = meData.user?.id;
  }

  const allItems: SourceResult["items"] = [];
  let offset = 0;

  while (true) {
    const searchParams = new URLSearchParams({
      since: `${params.since}T00:00:00Z`,
      until: `${params.until}T23:59:59Z`,
      sort_by: "created_at:desc",
      limit: "100",
      offset: String(offset),
    });
    if (userId) searchParams.set("user_ids[]", userId);

    const res = await fetch(`${API_BASE}/incidents?${searchParams}`, { headers });
    const data = await res.json();

    for (const incident of data.incidents ?? []) {
      allItems.push({
        title: incident.title ?? incident.summary ?? "Incident",
        description: `${incident.urgency ?? "high"} urgency — ${incident.status ?? "resolved"} — Service: ${incident.service?.summary ?? "unknown"}`,
        date: (incident.created_at ?? "").split("T")[0],
        url: incident.html_url,
      });
    }

    if (!(data.more ?? false) || allItems.length >= 500) break;
    offset += 100;
  }

  return {
    source: "PagerDuty Incidents",
    summary: `Responded to ${allItems.length} incidents (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getOncallShifts(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();
  const target = getTargetUser();

  let userId: string | undefined;
  if (target?.pagerduty?.userId) {
    userId = target.pagerduty.userId;
  } else {
    const meRes = await fetch(`${API_BASE}/users/me`, { headers });
    const meData = await meRes.json();
    userId = meData.user?.id;
  }

  const searchParams = new URLSearchParams({
    since: `${params.since}T00:00:00Z`,
    until: `${params.until}T23:59:59Z`,
  });
  if (userId) searchParams.set("user_ids[]", userId);

  const res = await fetch(`${API_BASE}/oncalls?${searchParams}`, { headers });
  const data = await res.json();

  const items = (data.oncalls ?? []).map((oncall: any) => ({
    title: `On-call: ${oncall.escalation_policy?.summary ?? "unknown policy"}`,
    description: `Schedule: ${oncall.schedule?.summary ?? "unscheduled"} — Level ${oncall.escalation_level ?? 1}`,
    date: (oncall.start ?? "").split("T")[0],
    url: oncall.schedule?.html_url,
  }));

  return {
    source: "PagerDuty On-Call",
    summary: `${items.length} on-call shifts (${params.since} to ${params.until})`,
    items,
    totalCount: items.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "PagerDuty",
  configKey: "pagerduty",
  envKey: "PAGERDUTY_TOKEN",
  description: "On-call shifts and incidents responded to",
  tools: {
    pagerduty_get_incidents: tool({
      description:
        "Get PagerDuty incidents the user responded to in a date range.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name} (email: ${target.email})` : "I";
          return claudeMcpQuery(
            `List the PagerDuty incidents ${who} responded to from ${params.since} to ${params.until}. Include: title, urgency, status, service, and date. Format as markdown.`,
          );
        }
        return formatSourceResult(await getIncidents(params));
      },
    }),
    pagerduty_get_oncall: tool({
      description:
        "Get the user's on-call shifts and schedules in a date range.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} PagerDuty on-call shifts from ${params.since} to ${params.until}. Include schedule name, escalation policy, and dates. Format as markdown.`,
          );
        }
        return formatSourceResult(await getOncallShifts(params));
      },
    }),
  },
});

export default source;
