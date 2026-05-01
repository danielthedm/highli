import { CmdKPalette } from "@/components/cmdk-palette";
import { TopStrip } from "@/components/top-strip";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCompanyActor } from "@/lib/company/auth";
import { listAudit } from "@/lib/company/me-data";
import { isCompanyMode } from "@/lib/company/runtime";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  if (!isCompanyMode()) {
    return (
      <AppShell width="narrow">
        <PageHeader
          eyebrow="Company mode"
          title="Audit log"
          description="The audit log tracks anonymous submission tokens, survey responses, consent grants, and named data queries in company mode."
        />
      </AppShell>
    );
  }
  const actor = await getCompanyActor();
  const events = await listAudit(actor);
  return (
    <>
      <TopStrip goal={null} />
      <AppShell width="reader">
        <PageHeader
          eyebrow="Engineer audit"
          title="Your company-mode audit log"
          description="Named-data query entries should stay empty in production because no manager-facing route queries you by name."
          meta={`${events.length} events`}
        />
        <section className="manager-theme-stack">
          {events.map((event) => (
            <article className="theme-row" key={event.id}>
              <p className="theme-title">{event.summary}</p>
              <p className="theme-copy">{event.type}</p>
              <pre className="json-panel small">
                {JSON.stringify(event.metadata ?? {}, null, 2)}
              </pre>
            </article>
          ))}
          {events.length === 0 && (
            <article className="theme-row">
              <p className="theme-title">No audit events yet.</p>
              <p className="theme-copy">Frustration tokens and survey submissions appear here.</p>
            </article>
          )}
        </section>
      </AppShell>
      <CmdKPalette />
    </>
  );
}
