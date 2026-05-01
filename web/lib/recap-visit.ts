import "server-only";
import { getSetting, setSetting } from "@/lib/store";

const RECAP_LAST_VISIT_KEY = "recap.lastVisitedAt";
const RECAP_AI_WINDOW_KEY = "recap.aiWindow";
const LEGACY_BRAG_LAST_VISIT_KEY = "brag.lastVisitedAt";
const LEGACY_BRAG_AI_WINDOW_KEY = "brag.aiWindow";

export interface RecapAiWindow {
  mode: "weekly" | "since-last-visit";
  since: string;
  sourceVisitAt: number | null;
  generatedAt: number;
  key: string;
}

export function getLastRecapVisitAt(): number | null {
  const raw =
    getSetting(RECAP_LAST_VISIT_KEY) ?? getSetting(LEGACY_BRAG_LAST_VISIT_KEY);
  if (!raw) return null;

  const timestamp = Number(raw);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function recordRecapVisitAt(date = new Date()): void {
  setSetting(RECAP_LAST_VISIT_KEY, String(date.getTime()));
}

export function getRecapAiWindow(): RecapAiWindow | null {
  const raw =
    getSetting(RECAP_AI_WINDOW_KEY) ?? getSetting(LEGACY_BRAG_AI_WINDOW_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<RecapAiWindow>;
    if (
      (parsed.mode === "weekly" || parsed.mode === "since-last-visit") &&
      typeof parsed.since === "string" &&
      typeof parsed.generatedAt === "number" &&
      typeof parsed.key === "string"
    ) {
      return {
        mode: parsed.mode,
        since: parsed.since,
        sourceVisitAt:
          typeof parsed.sourceVisitAt === "number" ? parsed.sourceVisitAt : null,
        generatedAt: parsed.generatedAt,
        key: parsed.key,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function recordRecapAiWindow(window: RecapAiWindow): void {
  setSetting(RECAP_AI_WINDOW_KEY, JSON.stringify(window));
}
