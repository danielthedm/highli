import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  timeframe?: { from: string; to: string };
  sources: string[];
}

export function Header({ timeframe, sources }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="magenta">
          highli
        </Text>
        <Text color="gray"> — performance review assistant</Text>
      </Box>
      <Box gap={2}>
        {timeframe && (
          <Text color="cyan">
            {timeframe.from} to {timeframe.to}
          </Text>
        )}
        <Text color="gray">
          Sources:{" "}
          {sources.length > 0 ? (
            sources.map((s, i) => (
              <Text key={s}>
                {i > 0 ? ", " : ""}
                <Text color="green">{s}</Text>
              </Text>
            ))
          ) : (
            <Text color="yellow">none connected</Text>
          )}
        </Text>
      </Box>
      <Text color="gray">{"─".repeat(60)}</Text>
    </Box>
  );
}
