import { tool } from "ai";
import { z } from "zod";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { getConfig } from "../config/defaults.js";
import { defineSource, getSourceMethod } from "./registry.js";
import { formatSourceResult, type SourceResult } from "./types.js";
import { claudeMcpQuery } from "./claude-mcp.js";
import { getTargetUser } from "../report/target-user.js";

const dateRange = {
  since: z.string().describe("Start date in YYYY-MM-DD format"),
  until: z.string().describe("End date in YYYY-MM-DD format"),
};

function getGitHubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
}

function getClient(): Octokit {
  return new Octokit({ auth: getGitHubToken() });
}

async function getUsername(octokit: Octokit): Promise<string> {
  const target = getTargetUser();
  if (target?.github?.username) return target.github.username;
  const config = getConfig();
  if (config.github.username) return config.github.username;
  const { data: user } = await octokit.users.getAuthenticated();
  return user.login;
}

// ── API functions ───────────────────────────────────────────────────

function buildScopeFilter(): string {
  const config = getConfig();
  const parts: string[] = [];
  for (const org of config.github.orgs) parts.push(`org:${org}`);
  for (const repo of config.github.repos) parts.push(`repo:${repo}`);
  return parts.join(" ");
}

async function getPullRequests(params: {
  since: string;
  until: string;
  state?: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const username = await getUsername(octokit);
  const scope = buildScopeFilter();

  const query = `author:${username} created:${params.since}..${params.until} is:pr ${scope} ${params.state === "all" ? "" : "is:merged"}`.trim();

  const allItems: SourceResult["items"] = [];
  let totalCount = 0;
  let page = 1;

  while (true) {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: query,
      sort: "created",
      order: "desc",
      per_page: 100,
      page,
    });

    if (page === 1) totalCount = data.total_count;

    for (const pr of data.items) {
      allItems.push({
        title: pr.title,
        description: `#${pr.number} in ${pr.repository_url.split("/").slice(-2).join("/")} — ${pr.state}`,
        date: pr.created_at.split("T")[0],
        url: pr.html_url,
        metrics: { comments: pr.comments },
      });
    }

    if (data.items.length < 100 || allItems.length >= totalCount) break;
    page++;
    if (page > 10) break; // GitHub search API max: 1000 results
  }

  const repos = new Set(
    allItems.map((item) => item.description.split(" in ")[1]?.split(" —")[0]).filter(Boolean),
  );

  return {
    source: "GitHub Pull Requests",
    summary: `Found ${totalCount} PRs by ${username} (${params.since} to ${params.until}) across ${repos.size} repos: ${[...repos].join(", ")}`,
    items: allItems,
    totalCount,
  };
}

async function getReviewsGiven(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const username = await getUsername(octokit);

  const scope = buildScopeFilter();
  const query = `reviewed-by:${username} created:${params.since}..${params.until} is:pr ${scope}`.trim();

  const allItems: SourceResult["items"] = [];
  let totalCount = 0;
  let page = 1;

  while (true) {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: query,
      sort: "created",
      order: "desc",
      per_page: 100,
      page,
    });

    if (page === 1) totalCount = data.total_count;

    for (const pr of data.items) {
      allItems.push({
        title: pr.title,
        description: `Reviewed #${pr.number} in ${pr.repository_url.split("/").slice(-2).join("/")}`,
        date: pr.created_at.split("T")[0],
        url: pr.html_url,
      });
    }

    if (data.items.length < 100 || allItems.length >= totalCount) break;
    page++;
    if (page > 10) break;
  }

  return {
    source: "GitHub Reviews Given",
    summary: `Reviewed ${totalCount} PRs (${params.since} to ${params.until})`,
    items: allItems,
    totalCount,
  };
}

async function getCollaborationPRs(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const target = getTargetUser();
  if (!target?.github?.username) {
    return {
      source: "GitHub Collaboration",
      summary: "No peer GitHub username resolved — cannot compute collaboration intersection.",
      items: [],
      totalCount: 0,
    };
  }

  const octokit = getClient();
  const config = getConfig();
  const me =
    config.github.username ??
    (await octokit.users.getAuthenticated()).data.login;
  const peer = target.github.username;
  const scope = buildScopeFilter();

  const queries: { label: string; q: string }[] = [
    {
      label: `I authored / ${peer} reviewed`,
      q: `author:${me} reviewed-by:${peer} created:${params.since}..${params.until} is:pr ${scope}`.trim(),
    },
    {
      label: `${peer} authored / I reviewed`,
      q: `author:${peer} reviewed-by:${me} created:${params.since}..${params.until} is:pr ${scope}`.trim(),
    },
    {
      label: `I commented on ${peer}'s PR`,
      q: `author:${peer} commenter:${me} created:${params.since}..${params.until} is:pr ${scope}`.trim(),
    },
    {
      label: `${peer} commented on my PR`,
      q: `author:${me} commenter:${peer} created:${params.since}..${params.until} is:pr ${scope}`.trim(),
    },
  ];

  const seen = new Set<string>();
  const allItems: SourceResult["items"] = [];
  let totalCount = 0;

  for (const { label, q } of queries) {
    try {
      const { data } = await octokit.search.issuesAndPullRequests({
        q,
        sort: "created",
        order: "desc",
        per_page: 100,
      });
      for (const pr of data.items) {
        // De-dupe by URL but preserve the first label that surfaced it
        if (seen.has(pr.html_url)) continue;
        seen.add(pr.html_url);
        totalCount++;
        allItems.push({
          title: pr.title,
          description: `${label} — #${pr.number} in ${pr.repository_url
            .split("/")
            .slice(-2)
            .join("/")}`,
          date: pr.created_at.split("T")[0],
          url: pr.html_url,
        });
      }
    } catch {
      // Swallow per-query errors — one bad query shouldn't wipe the whole log
    }
  }

  return {
    source: "GitHub Collaboration",
    summary: `Found ${totalCount} PRs where @${me} and @${peer} collaborated (${params.since} to ${params.until})`,
    items: allItems,
    totalCount,
  };
}

async function getCommitActivity(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const username = await getUsername(octokit);

  const scope = buildScopeFilter();
  const query = `author:${username} committer-date:${params.since}..${params.until} ${scope}`.trim();

  const allItems: SourceResult["items"] = [];
  let totalCount = 0;
  let page = 1;

  while (true) {
    const { data } = await octokit.search.commits({
      q: query,
      sort: "committer-date",
      order: "desc",
      per_page: 100,
      page,
    });

    if (page === 1) totalCount = data.total_count;

    for (const commit of data.items) {
      allItems.push({
        title: commit.commit.message.split("\n")[0],
        description: `in ${commit.repository.full_name}`,
        date: (commit.commit.committer?.date ?? "").split("T")[0],
        url: commit.html_url,
      });
    }

    if (data.items.length < 100 || allItems.length >= totalCount) break;
    page++;
    if (page > 10) break;
  }

  const repos = new Set(
    allItems.map((item) => item.description.replace("in ", "")).filter(Boolean),
  );

  return {
    source: "GitHub Commits",
    summary: `${totalCount} commits across ${repos.size} repos (${params.since} to ${params.until})`,
    items: allItems,
    totalCount,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "GitHub",
  configKey: "github",
  envKey: "GITHUB_TOKEN",
  description: "Pull requests, code reviews, and commit activity",
  isAvailable: () => !!getGitHubToken(),
  getUserContext: () => {
    const config = getConfig();
    const parts: string[] = [];
    if (config.github.username) parts.push(`GitHub username: ${config.github.username}`);
    if (config.github.orgs.length > 0) parts.push(`Work orgs (queries filtered to these): ${config.github.orgs.join(", ")}`);
    if (config.github.repos.length > 0) parts.push(`Repos: ${config.github.repos.join(", ")}`);
    return parts.join(". ");
  },
  tools: {
    github_get_prs: tool({
      description:
        "Get pull requests authored by the user in a date range. Returns PR titles, repos, status, and metrics.",
      parameters: z.object({
        ...dateRange,
        state: z
          .enum(["open", "closed", "all"])
          .default("all")
          .describe("Filter by PR state"),
      }),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `List ${who} GitHub pull requests from ${params.since} to ${params.until} (state: ${params.state}). For each PR include: title, PR number, repository, state, date created, and URL. Format as a markdown list.`,
          );
        }
        return formatSourceResult(await getPullRequests(params));
      },
    }),
    github_get_reviews: tool({
      description:
        "Get code reviews given by the user. Shows PRs they reviewed and when.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name} (email: ${target.email})` : "I";
          return claudeMcpQuery(
            `List the GitHub pull requests ${who} reviewed from ${params.since} to ${params.until}. For each include: PR title, number, repository, and date. Format as a markdown list.`,
          );
        }
        return formatSourceResult(await getReviewsGiven(params));
      },
    }),
    github_get_collab_prs: tool({
      description:
        "Get pull requests where the logged-in user and a peer collaborated — PRs one authored that the other reviewed or commented on. Only works when a peer target user is set (e.g. during `highli peer-review`).",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          if (!target?.github?.username) {
            return "No peer GitHub user resolved — skip this tool.";
          }
          return claudeMcpQuery(
            `List GitHub pull requests where I and ${target.name} (GitHub: @${target.github.username}) collaborated from ${params.since} to ${params.until}. Include: PRs I authored that they reviewed or commented on, and PRs they authored that I reviewed or commented on. For each PR include title, number, repository, date, URL, and which direction the collaboration went. Format as a markdown list.`,
          );
        }
        return formatSourceResult(await getCollaborationPRs(params));
      },
    }),
    github_get_commits: tool({
      description:
        "Get commit activity summary — commit count, repos, and top commits.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `Summarize ${who} GitHub commit activity from ${params.since} to ${params.until}. Include: total commit count, which repositories were committed to, and the most notable commit messages. Format as markdown.`,
          );
        }
        return formatSourceResult(await getCommitActivity(params));
      },
    }),
  },
});

export default source;
