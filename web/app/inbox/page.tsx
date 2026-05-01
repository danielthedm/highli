import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { InboxClient } from "@/components/inbox-client";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCurrentGoal } from "@/lib/store";
import { loadInboxData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "highli — inbox" };

export default async function InboxPage() {
  const current = getCurrentGoal();
  const data = await loadInboxData();

  return (
    <>
      <TopStrip
        goal={current?.text ?? null}
        level={current?.level}
        skills={current?.skills}
        growthAreas={current?.growthAreas}
      />
      <AppShell width="narrow">
        <PageHeader
          eyebrow="Curation"
          title="Inbox"
          description="Triage what AI surfaced. Pin matters; archive hides from consolidated views, never from the expansive doc."
        />
        <InboxClient
          events={data.events}
          starredIds={[...data.starredIds]}
          archivedIds={[...data.archivedIds]}
          manualGroups={data.manualGroups}
          suggestions={data.suggestions}
        />
      </AppShell>
      <CmdKPalette />
    </>
  );
}
