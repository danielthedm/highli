import { tool } from "ai";
import { z } from "zod";
import { getAvailableSources } from "../config/defaults.js";
import { formatSourceResult } from "../sources/types.js";
import * as github from "../sources/github.js";
import * as linear from "../sources/linear.js";
import * as slack from "../sources/slack.js";
import * as notion from "../sources/notion.js";

const dateRange = {
  since: z.string().describe("Start date in YYYY-MM-DD format"),
  until: z.string().describe("End date in YYYY-MM-DD format"),
};

const githubTools = {
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
      const result = await github.getPullRequests(params);
      return formatSourceResult(result);
    },
  }),
  github_get_reviews: tool({
    description:
      "Get code reviews given by the user. Shows PRs they reviewed and when.",
    parameters: z.object(dateRange),
    execute: async (params) => {
      const result = await github.getReviewsGiven(params);
      return formatSourceResult(result);
    },
  }),
  github_get_commits: tool({
    description:
      "Get commit activity summary — commit count, repos, and top commits.",
    parameters: z.object(dateRange),
    execute: async (params) => {
      const result = await github.getCommitActivity(params);
      return formatSourceResult(result);
    },
  }),
};

const linearTools = {
  linear_get_completed_issues: tool({
    description:
      "Get issues completed by the user in a date range. Returns issue titles, projects, labels, and point estimates.",
    parameters: z.object(dateRange),
    execute: async (params) => {
      const result = await linear.getCompletedIssues(params);
      return formatSourceResult(result);
    },
  }),
  linear_get_projects: tool({
    description:
      "Get projects the user contributed to. Shows project name, status, and progress.",
    parameters: z.object(dateRange),
    execute: async (params) => {
      const result = await linear.getProjects(params);
      return formatSourceResult(result);
    },
  }),
};

const slackTools = {
  slack_search_messages: tool({
    description:
      "Search the user's Slack messages. Returns messages matching a query within a date range. Use broad queries to find themes in communication.",
    parameters: z.object({
      ...dateRange,
      query: z
        .string()
        .default("")
        .describe("Search query (keywords, topics). Leave empty for all messages."),
      channels: z
        .array(z.string())
        .optional()
        .describe("Filter to specific channel names"),
    }),
    execute: async (params) => {
      const result = await slack.searchMessages(params);
      return formatSourceResult(result);
    },
  }),
  slack_get_channel_activity: tool({
    description:
      "Get the user's message counts in specific Slack channels over a date range.",
    parameters: z.object({
      ...dateRange,
      channels: z
        .array(z.string())
        .describe("Channel names to check activity in"),
    }),
    execute: async (params) => {
      const result = await slack.getChannelActivity(params);
      return formatSourceResult(result);
    },
  }),
};

const notionTools = {
  notion_search_pages: tool({
    description:
      "Search Notion for pages matching a query. Returns page titles, last edited dates, and URLs.",
    parameters: z.object({
      query: z.string().describe("Search query for Notion pages"),
      ...dateRange,
    }),
    execute: async (params) => {
      const result = await notion.searchPages(params);
      return formatSourceResult(result);
    },
  }),
  notion_get_page_content: tool({
    description:
      "Get the text content of a specific Notion page by ID. Use this to read documents like company values, team goals, or project docs.",
    parameters: z.object({
      pageId: z.string().describe("The Notion page ID"),
    }),
    execute: async (params) => {
      const result = await notion.getPageContent(params);
      return formatSourceResult(result);
    },
  }),
};

export function getEnabledTools(): Record<string, any> {
  const sources = getAvailableSources();
  const tools: Record<string, any> = {};

  if (sources.includes("github")) Object.assign(tools, githubTools);
  if (sources.includes("linear")) Object.assign(tools, linearTools);
  if (sources.includes("slack")) Object.assign(tools, slackTools);
  if (sources.includes("notion")) Object.assign(tools, notionTools);

  return tools;
}
