import { CmdKPalette } from "@/components/cmdk-palette";
import { TopStrip } from "@/components/top-strip";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCompanyActor } from "@/lib/company/auth";
import { getFlowFocus } from "@/lib/company/personal-oauth";
import { isCompanyMode } from "@/lib/company/runtime";

export const dynamic = "force-dynamic";

export default async function FlowPage() {
  if (!isCompanyMode()) {
    return (
      <AppShell width="narrow">
        <PageHeader
          eyebrow="Personal OAuth"
          title="Flow and focus"
          description="Calendar flow/focus data is a company-mode personal surface and is never aggregated to `/org/*`."
        />
      </AppShell>
    );
  }
  const actor = await getCompanyActor();
  const data = await getFlowFocus(actor);
  return (
    <>
      <TopStrip goal={null} />
      <AppShell width="wide">
        <PageHeader
          eyebrow="Engineer-private"
          title="Flow and focus"
          description="Meeting load and fragmented time are written only to `/me/*` personal tables."
          meta="gamma aggregation does not exist"
        />
        <section className="aggregate-strip">
          <div>
            <span>Days</span>
            <strong>{data.days.length}</strong>
          </div>
          <div>
            <span>Source</span>
            <strong>calendar</strong>
          </div>
          <div>
            <span>Org writes</span>
            <strong>0</strong>
          </div>
        </section>
        <pre className="json-panel">{JSON.stringify(data.days, null, 2)}</pre>
      </AppShell>
      <CmdKPalette />
    </>
  );
}
