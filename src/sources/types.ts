export interface SourceItem {
  title: string;
  description: string;
  date: string;
  url?: string;
  metrics?: Record<string, number>;
}

export interface SourceResult {
  source: string;
  summary: string;
  items: SourceItem[];
  totalCount: number;
}

export function formatSourceResult(result: SourceResult): string {
  const lines = [`## ${result.source} (${result.totalCount} items)\n`];
  lines.push(result.summary);
  if (result.items.length > 0) {
    lines.push("");
    for (const item of result.items) {
      const date = item.date ? ` (${item.date})` : "";
      const url = item.url ? ` — ${item.url}` : "";
      lines.push(`- **${item.title}**${date}${url}`);
      if (item.description) {
        lines.push(`  ${item.description}`);
      }
    }
  }
  return lines.join("\n");
}
