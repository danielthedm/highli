import type { Source } from "./registry.js";
import { getSourceMethod } from "./registry.js";
import { insertEvents, recordPullEnd, recordPullStart } from "./db/index.js";

export type IngestScope = "30-day" | "full-history";

export interface IngestProgress {
  source: string;
  status: "start" | "done" | "error" | "skip";
  inserted?: number;
  error?: string;
}

export interface IngestSummary {
  totalInserted: number;
  perSource: Record<string, { inserted: number; error?: string }>;
}

export async function ingestRange(
  sources: Source[],
  since: string,
  until: string,
  scope: IngestScope,
  onProgress?: (p: IngestProgress) => void,
): Promise<IngestSummary> {
  const summary: IngestSummary = { totalInserted: 0, perSource: {} };

  for (const source of sources) {
    if (!source.ingest) continue;

    const method = getSourceMethod(source);
    if (method === "skip" || method === "claude-mcp") {
      onProgress?.({ source: source.name, status: "skip" });
      continue;
    }

    onProgress?.({ source: source.name, status: "start" });
    const pullId = recordPullStart(source.configKey, scope, since, until);

    try {
      const events = await source.ingest(since, until);
      const inserted = insertEvents(events);
      recordPullEnd(pullId, inserted);
      summary.totalInserted += inserted;
      summary.perSource[source.name] = { inserted };
      onProgress?.({ source: source.name, status: "done", inserted });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      recordPullEnd(pullId, 0, message);
      summary.perSource[source.name] = { inserted: 0, error: message };
      onProgress?.({ source: source.name, status: "error", error: message });
    }
  }

  return summary;
}
