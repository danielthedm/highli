import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ActiveTool } from "../agent/types.js";

const TOOL_LABELS: Record<string, string> = {
  github_get_prs: "Fetching GitHub PRs",
  github_get_reviews: "Fetching GitHub reviews",
  github_get_commits: "Fetching GitHub commits",
  linear_get_completed_issues: "Fetching Linear issues",
  linear_get_projects: "Fetching Linear projects",
  slack_search_messages: "Searching Slack messages",
  slack_get_channel_activity: "Fetching Slack activity",
  notion_search_pages: "Searching Notion",
  notion_get_page_content: "Reading Notion page",
};

interface ToolStatusProps {
  tools: ActiveTool[];
}

export function ToolStatus({ tools }: ToolStatusProps) {
  if (tools.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {tools.map((tool) => {
        const label = TOOL_LABELS[tool.name] ?? tool.name;
        const elapsed = Math.round((Date.now() - tool.startedAt) / 1000);

        return (
          <Box key={tool.id} gap={1}>
            {tool.status === "running" ? (
              <>
                <Text color="yellow">
                  <Spinner type="dots" />
                </Text>
                <Text color="yellow">
                  {label}... ({elapsed}s)
                </Text>
              </>
            ) : tool.status === "done" ? (
              <>
                <Text color="green">✓</Text>
                <Text color="gray">{label}</Text>
              </>
            ) : (
              <>
                <Text color="red">✗</Text>
                <Text color="red">{label} (failed)</Text>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
