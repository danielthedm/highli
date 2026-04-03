import { Octokit } from "@octokit/rest";
import { getConfig } from "../config/defaults.js";
import type { SourceResult } from "./types.js";

function getClient(): Octokit {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN not set");
  }
  return new Octokit({ auth: process.env.GITHUB_TOKEN });
}

export async function getPullRequests(params: {
  since: string;
  until: string;
  repos?: string[];
  state?: "open" | "closed" | "all";
}): Promise<SourceResult> {
  const octokit = getClient();
  const config = getConfig();
  const username = config.github.username;

  if (!username) {
    // Try to detect from token
    const { data: user } = await octokit.users.getAuthenticated();
    return await fetchPRsForUser(octokit, user.login, params);
  }

  return await fetchPRsForUser(octokit, username, params);
}

async function fetchPRsForUser(
  octokit: Octokit,
  username: string,
  params: { since: string; until: string; repos?: string[]; state?: string },
): Promise<SourceResult> {
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
    metrics: {
      comments: pr.comments,
    },
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

export async function getReviewsGiven(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const config = getConfig();
  let username = config.github.username;

  if (!username) {
    const { data: user } = await octokit.users.getAuthenticated();
    username = user.login;
  }

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

export async function getCommitActivity(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const octokit = getClient();
  const config = getConfig();
  let username = config.github.username;

  if (!username) {
    const { data: user } = await octokit.users.getAuthenticated();
    username = user.login;
  }

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
