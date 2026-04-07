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
  return (process.env.GITLAB_URL ?? "https://gitlab.com").replace(/\/$/, "");
}

function getHeaders(): Record<string, string> {
  return {
    "PRIVATE-TOKEN": process.env.GITLAB_TOKEN ?? "",
    Accept: "application/json",
  };
}

// ── API functions ───────────────────────────────────────────────────

async function getMergeRequests(params: {
  since: string;
  until: string;
  state?: string;
}): Promise<SourceResult> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const target = getTargetUser();

  // Get current user if no target
  let authorUsername: string | undefined;
  if (target?.gitlab?.username) {
    authorUsername = target.gitlab.username;
  } else {
    const userRes = await fetch(`${baseUrl}/api/v4/user`, { headers });
    const user = await userRes.json();
    authorUsername = user.username;
  }

  const allItems: SourceResult["items"] = [];
  let page = 1;

  while (true) {
    const searchParams = new URLSearchParams({
      author_username: authorUsername ?? "",
      created_after: params.since,
      created_before: params.until,
      state: params.state === "all" ? "all" : "merged",
      per_page: "100",
      page: String(page),
      scope: "all",
    });

    const res = await fetch(`${baseUrl}/api/v4/merge_requests?${searchParams}`, { headers });
    const mrs = await res.json();

    if (!Array.isArray(mrs) || mrs.length === 0) break;

    for (const mr of mrs) {
      allItems.push({
        title: mr.title,
        description: `!${mr.iid} in ${mr.references?.full ?? mr.source_project_id} — ${mr.state}`,
        date: (mr.created_at ?? "").split("T")[0],
        url: mr.web_url,
        metrics: { comments: mr.user_notes_count ?? 0 },
      });
    }

    if (mrs.length < 100) break;
    page++;
    if (page > 10) break;
  }

  return {
    source: "GitLab Merge Requests",
    summary: `Found ${allItems.length} MRs by ${authorUsername} (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getReviewsGiven(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const target = getTargetUser();

  let reviewerUsername: string | undefined;
  if (target?.gitlab?.username) {
    reviewerUsername = target.gitlab.username;
  } else {
    const userRes = await fetch(`${baseUrl}/api/v4/user`, { headers });
    const user = await userRes.json();
    reviewerUsername = user.username;
  }

  const searchParams = new URLSearchParams({
    reviewer_username: reviewerUsername ?? "",
    created_after: params.since,
    created_before: params.until,
    per_page: "100",
    scope: "all",
  });

  const allItems: SourceResult["items"] = [];
  let page = 1;

  while (true) {
    searchParams.set("page", String(page));
    const res = await fetch(`${baseUrl}/api/v4/merge_requests?${searchParams}`, { headers });
    const mrs = await res.json();

    if (!Array.isArray(mrs) || mrs.length === 0) break;

    for (const mr of mrs) {
      allItems.push({
        title: mr.title,
        description: `Reviewed !${mr.iid} in ${mr.references?.full ?? mr.source_project_id}`,
        date: (mr.created_at ?? "").split("T")[0],
        url: mr.web_url,
      });
    }

    if (mrs.length < 100) break;
    page++;
    if (page > 10) break;
  }

  return {
    source: "GitLab Reviews Given",
    summary: `Reviewed ${allItems.length} MRs (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getCommitActivity(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  // Get user's events (push events contain commits)
  const searchParams = new URLSearchParams({
    action: "pushed",
    after: params.since,
    before: params.until,
    per_page: "100",
  });

  const res = await fetch(`${baseUrl}/api/v4/events?${searchParams}`, { headers });
  const events = await res.json();

  const items = (Array.isArray(events) ? events : []).map((event: any) => ({
    title: event.push_data?.commit_title ?? "Push event",
    description: `${event.push_data?.commit_count ?? 1} commit(s) to ${event.project_id}`,
    date: (event.created_at ?? "").split("T")[0],
  }));

  return {
    source: "GitLab Commits",
    summary: `${items.length} push events (${params.since} to ${params.until})`,
    items,
    totalCount: items.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "GitLab",
  configKey: "gitlab",
  envKey: "GITLAB_TOKEN",
  description: "Merge requests, code reviews, and commit activity",
  tools: {
    gitlab_get_merge_requests: tool({
      description:
        "Get merge requests authored by the user in a date range. Returns MR titles, projects, status, and metrics.",
      parameters: z.object({
        ...dateRange,
        state: z
          .enum(["merged", "opened", "closed", "all"])
          .default("merged")
          .describe("Filter by MR state"),
      }),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} GitLab merge requests from ${params.since} to ${params.until} (state: ${params.state}). For each include: title, MR number, project, state, and date. Format as markdown.`,
          );
        }
        return formatSourceResult(await getMergeRequests(params));
      },
    }),
    gitlab_get_reviews: tool({
      description:
        "Get code reviews given by the user on GitLab merge requests.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name} (email: ${target.email})` : "I";
          return claudeMcpQuery(
            `List the GitLab merge requests ${who} reviewed from ${params.since} to ${params.until}. Include: MR title, number, project, and date. Format as markdown.`,
          );
        }
        return formatSourceResult(await getReviewsGiven(params));
      },
    }),
    gitlab_get_commits: tool({
      description:
        "Get commit/push activity summary from GitLab.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `Summarize ${who} GitLab commit activity from ${params.since} to ${params.until}. Include total commits, projects, and notable commit messages. Format as markdown.`,
          );
        }
        return formatSourceResult(await getCommitActivity(params));
      },
    }),
  },
});

export default source;
