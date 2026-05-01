import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { AppShell, PageHeader } from "@/components/page-header";
import { Timeline } from "@/components/timeline";
import { eventCount } from "@/lib/store";
import { loadHomeBaseData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "highli — timeline" };

export default async function TimelinePage() {
  const total = eventCount();
  const data = loadHomeBaseData();

  return (
    <>
      <TopStrip
        goal={data.goal}
        level={data.goalRecord?.level}
        skills={data.goalRecord?.skills}
        growthAreas={data.goalRecord?.growthAreas}
      />
      <AppShell width="wide">
        <PageHeader
          eyebrow="Raw timeline"
          title="Captured work feed"
          description="The unpolished source-of-truth stream from connected tools. No AI grouping, no narrative rewriting, no suppression of archived events."
          meta={`${total.toLocaleString()} captured ${total === 1 ? "event" : "events"}`}
        />

        {total === 0 ? (
          <section className="empty-state">
            <p className="eyebrow-pill">Local store is empty</p>
            <h2>Start with one pull from your terminal.</h2>
            <p>
              Run <code className="inline-code">highli</code> to populate the
              local store. Once events exist, this page becomes the raw feed
              that powers your living brag doc.
            </p>
          </section>
        ) : (
          <Timeline
            events={data.timelineEvents}
            aiGroups={[]}
            manualGroups={[]}
            starredIds={[...data.starredIds]}
            archivedIds={[...data.archivedIds]}
          />
        )}
      </AppShell>
      <CmdKPalette />
    </>
  );
}
