import { CmdKPalette } from "@/components/cmdk-palette";
import { TopStrip } from "@/components/top-strip";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCompanyActor } from "@/lib/company/auth";
import { listSurveys } from "@/lib/company/surveys";
import { isCompanyMode } from "@/lib/company/runtime";

export const dynamic = "force-dynamic";

export default async function ManagerSurveysPage() {
  if (!isCompanyMode()) {
    return (
      <AppShell width="narrow">
        <PageHeader
          eyebrow="Company mode required"
          title="Surveys"
          description="Manager-created anonymous surveys are available in company mode."
        />
      </AppShell>
    );
  }
  await getCompanyActor();
  const surveys = await listSurveys();
  return (
    <>
      <TopStrip goal={null} />
      <AppShell width="wide">
        <PageHeader
          eyebrow="Anonymous surveys"
          title="Survey module"
          description="Audiences are department, division, or company. Team audiences are not a product surface."
        />
        <section className="manager-theme-stack">
          {surveys.map((survey: any) => (
            <article className="theme-row" key={survey.id}>
              <p className="theme-title">{survey.title}</p>
              <p className="theme-copy">
                {survey.audience_type} · {survey.audience_key} · {survey.status}
              </p>
            </article>
          ))}
          {surveys.length === 0 && (
            <article className="theme-row">
              <p className="theme-title">No surveys yet.</p>
              <p className="theme-copy">
                Create surveys through `/api/manager/surveys`; responses write to
                identity-free anonymous survey tables.
              </p>
            </article>
          )}
        </section>
      </AppShell>
      <CmdKPalette />
    </>
  );
}
