import { tool } from "ai";
import { z } from "zod";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { getConfig } from "../config/defaults.js";
import { defineSource, getSourceMethod } from "./registry.js";
import { formatSourceResult, type SourceResult } from "./types.js";
import { claudeMcpQuery } from "./claude-mcp.js";

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
  const config = getConfig();
  if (config.github.username) return config.github.username;
  const { data: user } = await octokit.users.getAuthenticated();
  return user.login;
}

// ── API functions ───────────────────────────────────────────────────

async function getPullRequests(params: {
  since: string;
  until: string;
  state?: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const username = await getUsername(octokit);

  const query = `author:${username} created:${params.since}..${params.until} is:pr ${params.state === "all" ? "" : "is:merged"}`;
  const { data } = await octokit.search.issuesAndPullRequests({
    q: query,
    sort: "created",
    order: "desc",
    per_page: 100,
  });

  const items = data.items.map((pr) => ({
    title: pr.title,
    description: `#${pr.number} in ${pr.repository_url.split("/").slice(-2).join("/")} — ${pr.state}`,
    date: pr.created_at.split("T")[0],
    url: pr.html_url,
    metrics: { comments: pr.comments },
  }));

  const repos = new Set(
    data.items.map((pr) => pr.repository_url.split("/").slice(-2).join("/")),
  );

  return {
    source: "GitHub Pull Requests",
    summary: `Found ${data.total_count} PRs by ${username} (${params.since} to ${params.until}) across ${repos.size} repos: ${[...repos].join(", ")}`,
    items,
    totalCount: data.total_count,
  };
}

async function getReviewsGiven(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const username = await getUsername(octokit);

  const query = `reviewed-by:${username} created:${params.since}..${params.until} is:pr`;
  const { data } = await octokit.search.issuesAndPullRequests({
    q: query,
    sort: "created",
    order: "desc",
    per_page: 100,
  });

  const items = data.items.map((pr) => ({
    title: pr.title,
    description: `Reviewed #${pr.number} in ${pr.repository_url.split("/").slice(-2).join("/")}`,
    date: pr.created_at.split("T")[0],
    url: pr.html_url,
  }));

  return {
    source: "GitHub Reviews Given",
    summary: `Reviewed ${data.total_count} PRs (${params.since} to ${params.until})`,
    items,
    totalCount: data.total_count,
  };
}

async function getCommitActivity(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const username = await getUsername(octokit);

  const query = `author:${username} committer-date:${params.since}..${params.until}`;
  const { data } = await octokit.search.commits({
    q: query,
    sort: "committer-date",
    order: "desc",
    per_page: 100,
  });

  const items = data.items.map((commit) => ({
    title: commit.commit.message.split("\n")[0],
    description: `in ${commit.repository.full_name}`,
    date: (commit.commit.committer?.date ?? "").split("T")[0],
    url: commit.html_url,
  }));

  const repos = new Set(data.items.map((c) => c.repository.full_name));

  return {
    source: "GitHub Commits",
    summary: `${data.total_count} commits across ${repos.size} repos (${params.since} to ${params.until})`,
    items,
    totalCount: data.total_count,
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
    if (!config.github.username) return "";
    return `GitHub username: ${config.github.username}. Repos: ${config.github.repos.join(", ") || "all accessible"}.`;
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
          return claudeMcpQuery(
            `List my GitHub pull requests from ${params.since} to ${params.until} (state: ${params.state}). For each PR include: title, PR number, repository, state, date created, and URL. Format as a markdown list.`,
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
          return claudeMcpQuery(
            `List the GitHub pull requests I reviewed from ${params.since} to ${params.until}. For each include: PR title, number, repository, and date. Format as a markdown list.`,
          );
        }
        return formatSourceResult(await getReviewsGiven(params));
      },
    }),
    github_get_commits: tool({
      description:
        "Get commit activity summary — commit count, repos, and top commits.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          return claudeMcpQuery(
            `Summarize my GitHub commit activity from ${params.since} to ${params.until}. Include: total commit count, which repositories I committed to, and the most notable commit messages. Format as markdown.`,
          );
        }
        return formatSourceResult(await getCommitActivity(params));
      },
    }),
  },
});

export default source;
