import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  onScreenshot: (path: string) => void;
  onExport: () => void;
  onQuit: () => void;
  disabled?: boolean;
}

export function ChatInput({
  onSubmit,
  onScreenshot,
  onExport,
  onQuit,
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Handle slash commands
    if (trimmed.startsWith("/screenshot ")) {
      const path = trimmed.slice("/screenshot ".length).trim();
      onScreenshot(path);
      setValue("");
      return;
    }
    if (trimmed === "/export") {
      onExport();
      setValue("");
      return;
    }
    if (trimmed === "/quit" || trimmed === "/exit") {
      onQuit();
      return;
    }

    onSubmit(trimmed);
    setValue("");
  };

  if (disabled) {
    return (
      <Box>
        <Text color="gray">Thinking...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="blue" bold>
          {"❯ "}
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message, paste review questions, or /screenshot <path>"
        />
      </Box>
      <Text color="gray" dimColor>
        /screenshot &lt;path&gt; | /export | /quit
      </Text>
    </Box>
  );
}
