import { CmdKPalette } from "@/components/cmdk-palette";
import { TopStrip } from "@/components/top-strip";
import { AppShell, PageHeader } from "@/components/page-header";
import { ManagerThemeActions } from "@/components/manager-actions";
import { getCompanyActor } from "@/lib/company/auth";
import { getAnonymousThemes } from "@/lib/company/anon-data";
import { getDigestForRequest, getMetricThemes } from "@/lib/company/org-data";
import { isCompanyMode } from "@/lib/company/runtime";

export const dynamic = "force-dynamic";

export default async function ManagerDigestPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isCompanyMode()) return <CompanyModeRequiredPage surface="Manager digest" />;
  const actor = await getCompanyActor();
  const params = new URLSearchParams();
  const raw = searchParams ? await searchParams : {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }
  if (!params.has("scope")) params.set("scope", "company");

  const [digest, anonThemes, metricThemes] = await Promise.all([
    getDigestForRequest(actor, params),
    getAnonymousThemes(actor, params),
    getMetricThemes(actor, params),
  ]);

  const themes = [
    ...(anonThemes.themes ?? []).map((theme: any) => ({ ...theme, source: "anon" as const })),
    ...(metricThemes.themes ?? []).map((theme: any) => ({ ...theme, source: "metric" as const })),
  ];

  return (
    <>
      <TopStrip goal={null} />
      <AppShell width="wide">
        <PageHeader
          eyebrow="Manager weekly digest"
          title="Friction to respond to"
          description="Themes render before metrics. The manager job is response, not individual evaluation."
          meta={`${digest.scope.scopeType}: ${digest.scope.scopeKey}`}
        />

        {!digest.scope.renderable ? (
          <section className="empty-state">
            <h2>{digest.scope.reason}</h2>
            <p>{digest.scope.emptyState}</p>
          </section>
        ) : (
          <>
            <section className="manager-theme-stack">
              {themes.length === 0 && (
                <div className="theme-row">
                  <p className="theme-title">A quiet week.</p>
                  <p className="theme-copy">
                    No anonymous or metric-driven theme passed the floor for this scope.
                  </p>
                </div>
              )}
              {themes.map((theme: any) => (
                <article className="theme-row" key={`${theme.source}-${theme.id}`}>
                  <p className="theme-title">{theme.title}</p>
                  <p className="theme-copy">
                    {theme.composite_excerpt ?? theme.hypothesis}
                  </p>
                  <p className="theme-meta">
                    {theme.sample_count ?? theme.sample_size ?? 0} samples
                  </p>
                  <ManagerThemeActions themeSource={theme.source} themeId={String(theme.id)} />
                </article>
              ))}
            </section>

            <section className="aggregate-strip">
              <div>
                <span>Work mix</span>
                <strong>{digest.digest?.alpha?.length ?? 0} buckets</strong>
              </div>
              <div>
                <span>Initiatives</span>
                <strong>{digest.digest?.beta?.length ?? 0}</strong>
              </div>
              <div>
                <span>Deploys</span>
                <strong>{digest.digest?.delta?.deploys ?? 0}</strong>
              </div>
              <div>
                <span>AI-assisted</span>
                <strong>{digest.digest?.zeta?.percent ?? 0}%</strong>
              </div>
            </section>
          </>
        )}
      </AppShell>
      <CmdKPalette />
    </>
  );
}

function CompanyModeRequiredPage({ surface }: { surface: string }) {
  return (
    <AppShell width="narrow">
      <PageHeader
        eyebrow="Company mode required"
        title={surface}
        description="This surface only runs when highli-core is connected to the company Postgres database."
      />
    </AppShell>
  );
}
