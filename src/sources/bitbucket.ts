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

const API_BASE = "https://api.bitbucket.org/2.0";

function getHeaders(): Record<string, string> {
  const username = process.env.BITBUCKET_USERNAME ?? "";
  const token = process.env.BITBUCKET_TOKEN ?? "";
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`,
    Accept: "application/json",
  };
}

function getWorkspace(): string {
  return process.env.BITBUCKET_WORKSPACE ?? "";
}

// ── API functions ───────────────────────────────────────────────────

async function getPullRequests(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();
  const workspace = getWorkspace();
  const target = getTargetUser();

  // List repositories in workspace, then get PRs
  const reposRes = await fetch(
    `${API_BASE}/repositories/${workspace}?pagelen=100&sort=-updated_on`,
    { headers },
  );
  const reposData = await reposRes.json();

  const allItems: SourceResult["items"] = [];

  for (const repo of reposData.values ?? []) {
    const slug = repo.slug;
    const prsRes = await fetch(
      `${API_BASE}/repositories/${workspace}/${slug}/pullrequests?state=MERGED&state=OPEN&pagelen=50`,
      { headers },
    );
    const prsData = await prsRes.json();

    for (const pr of prsData.values ?? []) {
      const createdDate = (pr.created_on ?? "").split("T")[0];
      if (createdDate < params.since || createdDate > params.until) continue;

      // Filter by author
      const authorUuid = pr.author?.uuid;
      if (target?.bitbucket?.uuid && authorUuid !== target.bitbucket.uuid) continue;

      allItems.push({
        title: pr.title,
        description: `#${pr.id} in ${workspace}/${slug} — ${pr.state}`,
        date: createdDate,
        url: pr.links?.html?.href,
        metrics: { comments: pr.comment_count ?? 0 },
      });
    }

    if (allItems.length >= 500) break;
  }

  return {
    source: "Bitbucket Pull Requests",
    summary: `Found ${allItems.length} PRs (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getCommitActivity(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();
  const workspace = getWorkspace();

  const reposRes = await fetch(
    `${API_BASE}/repositories/${workspace}?pagelen=50&sort=-updated_on`,
    { headers },
  );
  const reposData = await reposRes.json();

  const allItems: SourceResult["items"] = [];

  for (const repo of (reposData.values ?? []).slice(0, 20)) {
    const slug = repo.slug;
    const commitsRes = await fetch(
      `${API_BASE}/repositories/${workspace}/${slug}/commits?pagelen=50`,
      { headers },
    );
    const commitsData = await commitsRes.json();

    for (const commit of commitsData.values ?? []) {
      const date = (commit.date ?? "").split("T")[0];
      if (date < params.since || date > params.until) continue;

      allItems.push({
        title: (commit.message ?? "").split("\n")[0],
        description: `in ${workspace}/${slug}`,
        date,
        url: commit.links?.html?.href,
      });
    }

    if (allItems.length >= 500) break;
  }

  const repos = new Set(
    allItems.map((item) => item.description.replace("in ", "")).filter(Boolean),
  );

  return {
    source: "Bitbucket Commits",
    summary: `${allItems.length} commits across ${repos.size} repos (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "Bitbucket",
  configKey: "bitbucket",
  envKey: "BITBUCKET_TOKEN",
  description: "Pull requests, commits, and repository contributions",
  tools: {
    bitbucket_get_pull_requests: tool({
      description:
        "Get Bitbucket pull requests in a date range. Returns PR titles, repos, status, and comment counts.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} Bitbucket pull requests from ${params.since} to ${params.until}. Include: title, PR number, repository, state, and date. Format as markdown.`,
          );
        }
        return formatSourceResult(await getPullRequests(params));
      },
    }),
    bitbucket_get_commits: tool({
      description:
        "Get commit activity from Bitbucket repositories.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `Summarize ${who} Bitbucket commit activity from ${params.since} to ${params.until}. Include total commits, repos, and notable messages. Format as markdown.`,
          );
        }
        return formatSourceResult(await getCommitActivity(params));
      },
    }),
  },
});

export default source;
