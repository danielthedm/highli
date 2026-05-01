import { Suspense } from "react";
import Link from "next/link";
import { TopStrip } from "@/components/top-strip";
import { FooterZone } from "@/components/footer-zone";
import { CmdKPalette } from "@/components/cmdk-palette";
import { RecapVisitMarker } from "@/components/recap-visit-marker";
import { SectionHeader } from "@/components/section-header";
import {
  WeeklyMemory,
  WeeklyMemoryFallback,
  buildRecapHeader,
} from "@/components/weekly-memory";
import { eventCount } from "@/lib/store";
import { loadHomeBaseData, loadWeeklyAiData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const total = eventCount();
  const data = loadHomeBaseData();
  const recapHeader = buildRecapHeader(data);
  const starredArray = Array.from(data.starredIds);
  const weeklyAiPromise = total > 0 ? loadWeeklyAiData(data) : null;

  return (
    <>
      <TopStrip
        goal={data.goal}
        level={data.goalRecord?.level}
        skills={data.goalRecord?.skills}
        growthAreas={data.goalRecord?.growthAreas}
      />
      <main className="home-shell">
        <section className="home-hero" aria-labelledby="home-title">
          <div>
            <p className="eyebrow-pill">AI-curated work memory</p>
            <h1 id="home-title" className="hero-title">
              Keep the work that matters in view.
            </h1>
            <p className="hero-copy">
              highli turns the trail from GitHub, Slack, Linear, Notion, and
              the rest of your tools into a calm career narrative you can
              actually use when review season arrives.
            </p>
            <div className="hero-actions">
              {total > 0 ? (
                <a href="#home-recap" className="hero-button primary">
                  Read AI recap
                </a>
              ) : (
                <Link href="/timeline" className="hero-button primary">
                  Open raw timeline
                </Link>
              )}
              <Link href="/brag" className="hero-button secondary">
                Open brag doc
              </Link>
            </div>
          </div>

          <ProductMockup total={total} />
        </section>

        {total > 0 && (
          <section
            id="home-recap"
            className="home-recap anchor-target"
            aria-labelledby="home-recap-title"
          >
            <div className="reading-layout home-recap-layout">
              <div className="reading-main">
                <section className="section-block" aria-labelledby="home-recap-title">
                  <SectionHeader
                    id="home-recap-title"
                    kicker={recapHeader.kicker}
                    title={recapHeader.title}
                    note={recapHeader.note}
                  />
                  <Suspense fallback={<WeeklyMemoryFallback />}>
                    <WeeklyMemory
                      aiPromise={weeklyAiPromise}
                      data={data}
                      starredIds={starredArray}
                    />
                  </Suspense>
                </section>
              </div>

              <aside className="reading-rail" aria-label="Home recap context">
                <div className="rail-card">
                  <p className="rail-label">Raw source</p>
                  <p className="rail-copy">
                    The recap is a memory pass over the raw timeline. It does not
                    rewrite or hide the source feed.
                  </p>
                  <Link href="/timeline" className="rail-link">
                    Open timeline
                  </Link>
                </div>
                <div className="rail-card">
                  <p className="rail-label">Living doc</p>
                  <p className="rail-copy">
                    The brag doc is the running markdown document. Use it when
                    you want the durable version, not the quick recap.
                  </p>
                  <Link href="/brag" className="rail-link">
                    Open brag doc
                  </Link>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>
      <FooterZone />
      <CmdKPalette />
      <RecapVisitMarker />
    </>
  );
}

function ProductMockup({ total }: { total: number }) {
  return (
    <div className="knowledge-card" aria-hidden="true">
      <div className="mock-toolbar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
      </div>
      <div className="mock-body">
        <div className="mock-sidebar">
          <span className="mock-nav-item active" />
          <span className="mock-nav-item" />
          <span className="mock-nav-item" />
          <span className="mock-nav-item" />
        </div>
        <div className="mock-doc">
          <p className="mock-kicker">This week</p>
          <h2 className="mock-title">Your work, rewritten as memory.</h2>
          <div className="mock-line" />
          <div className="mock-line" />
          <div className="mock-line short" />
          <div className="mock-highlight">
            <strong>
              {total > 0 ? `${total.toLocaleString()} events` : "No events yet"}
            </strong>
            <span>
              The raw trail remains intact. highli only helps decide what is
              worth remembering first.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
