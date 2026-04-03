import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ActiveTool } from "../agent/types.js";

function formatToolName(name: string): string {
  // "github_get_prs" → "Fetching GitHub PRs"
  // "slack_search_messages" → "Searching Slack messages"
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^(\w+) Get /, "Fetching $1 ")
    .replace(/^(\w+) Search /, "Searching $1 ");
}

interface ToolStatusProps {
  tools: ActiveTool[];
}

export function ToolStatus({ tools }: ToolStatusProps) {
  if (tools.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {tools.map((tool) => {
        const label = formatToolName(tool.name);
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
