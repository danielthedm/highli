import { HighlightsSection } from "@/components/highlights-section";
import { ForgottenCallout } from "@/components/forgotten-callout";
import type { HomeBaseData, WeeklyAiData } from "@/lib/data";

export function buildRecapHeader(data: HomeBaseData): {
  kicker: string;
  title: string;
  note: string;
} {
  if (data.recapMode === "since-last-visit" && data.recapSourceVisitAt) {
    const lastVisit = new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(data.recapSourceVisitAt));

    return {
      kicker: "Since last visit",
      title: "What changed while you were away.",
      note: `Recapped from captured work since ${lastVisit}. The running brag doc stays separate; this is the home memory pass.`,
    };
  }

  return {
    kicker: "This week",
    title: "The few things worth carrying forward.",
    note: "AI-curated from recent work and reused for 24 hours before the next refresh window.",
  };
}

export async function WeeklyMemory({
  aiPromise,
  data,
  starredIds,
}: {
  aiPromise: Promise<WeeklyAiData> | null;
  data: HomeBaseData;
  starredIds: string[];
}) {
  const ai = await aiPromise;

  return (
    <>
      <HighlightsSection
        highlights={ai?.highlights ?? []}
        events={data.thisWeekEvents}
        starredIds={starredIds}
      />
      <ForgottenCallout
        insight={ai?.insight ?? {
          eventId: null,
          callout: "(none)",
          reasoning: "",
          confidence: 0,
        }}
        events={data.thisWeekEvents}
      />
    </>
  );
}

export function WeeklyMemoryFallback() {
  return (
    <div className="highlights-list" aria-label="Curating recent memory">
      <div className="highlight-card">
        <span className="highlight-index">AI</span>
        <div>
          <p className="highlight-title">Curating recent evidence.</p>
          <p className="highlight-copy">
            The raw timeline remains available while the home recap catches up.
          </p>
        </div>
      </div>
    </div>
  );
}
