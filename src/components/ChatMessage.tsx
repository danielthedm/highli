import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage as ChatMessageType } from "../agent/types.js";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={isUser ? "blue" : "magenta"}>
        {isUser ? "You" : "highli"}
      </Text>
      {message.imageUrl && (
        <Text color="gray">[Screenshot: {message.imageUrl}]</Text>
      )}
      <Box marginLeft={0}>
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    </Box>
  );
}

interface StreamingMessageProps {
  text: string;
}

export function StreamingMessage({ text }: StreamingMessageProps) {
  if (!text) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="magenta">
        highli
      </Text>
      <Box marginLeft={0}>
        <Text wrap="wrap">{text}</Text>
        <Text color="gray">|</Text>
      </Box>
    </Box>
  );
}
