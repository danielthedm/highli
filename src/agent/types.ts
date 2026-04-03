export interface ReviewSession {
  timeframe: { from: string; to: string };
  questions: string[];
  sources: string[];
}

export interface ActiveTool {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  startedAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; result: string }[];
  imageUrl?: string;
}
