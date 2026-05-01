import "dotenv/config";
import {
  generateForgottenInsight,
  INSIGHT_CONFIDENCE_THRESHOLD,
} from "@highli/core/ai";
import type { Event } from "@highli/core";

async function main() {
  // Empty events: must short-circuit to confidence=0, no LLM call.
  const empty = await generateForgottenInsight({
    events: [],
    since: "2026-04-01",
    until: "2026-04-30",
  });
  console.log("[empty]    confidence=%s  rendered=%s  callout=%j",
    empty.confidence,
    empty.confidence >= INSIGHT_CONFIDENCE_THRESHOLD,
    empty.callout,
  );

  // Mundane events — small, repetitive, nothing surprising.
  // The threshold-gated UI should NOT render this.
  const mundane: Event[] = Array.from({ length: 6 }).map((_, i) => ({
    id: `github:commit:demo/repo@${i}`,
    source: "github",
    type: "commit",
    ts: Date.parse("2026-04-15T12:00:00Z") + i * 3600_000,
    title: `Bump dependency ${i}`,
    summary: "in demo/repo",
    url: `https://github.com/demo/repo/commit/${i}`,
    payload: { repo: "demo/repo", sha: String(i) },
  }));
  const dull = await generateForgottenInsight({
    events: mundane,
    since: "2026-04-01",
    until: "2026-04-30",
  });
  console.log("[mundane]  confidence=%s  rendered=%s  callout=%j  reasoning=%j",
    dull.confidence,
    dull.confidence >= INSIGHT_CONFIDENCE_THRESHOLD,
    dull.callout,
    dull.reasoning,
  );

  // Notable event — a tiny PR that closes long-open issues.
  const notable: Event[] = [
    ...mundane,
    {
      id: "github:pr-authored:demo/repo#42",
      source: "github",
      type: "pr_authored",
      ts: Date.parse("2026-04-22T21:42:00Z"),
      title: "fix race condition in token refresh",
      summary: "#42 in demo/repo — closed (merged)",
      url: "https://github.com/demo/repo/pull/42",
      payload: {
        number: 42,
        repo: "demo/repo",
        merged_at: "2026-04-22T21:42:00Z",
        comments: 0,
        body: "Fixes #11 (open 6 weeks). Fixes #18 (open 6 weeks).",
        labels: ["bug"],
      },
    },
  ];
  const sharp = await generateForgottenInsight({
    events: notable,
    since: "2026-04-01",
    until: "2026-04-30",
  });
  console.log("[notable]  confidence=%s  rendered=%s  callout=%j  reasoning=%j",
    sharp.confidence,
    sharp.confidence >= INSIGHT_CONFIDENCE_THRESHOLD,
    sharp.callout,
    sharp.reasoning,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
