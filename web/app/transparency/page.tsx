import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { AppShell, PageHeader } from "@/components/page-header";
import { TransparencyClient } from "@/components/transparency-client";
import { getCompanyActor } from "@/lib/company/auth";
import { getAnonymousThemes } from "@/lib/company/anon-data";
import { getDigestForRequest, getMetricThemes } from "@/lib/company/org-data";
import { isCompanyMode } from "@/lib/company/runtime";
import { getCurrentGoal } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "highli — what your manager sees",
};

export default async function TransparencyPage() {
  if (!isCompanyMode()) {
    const current = getCurrentGoal();
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
            eyebrow="Boundaries"
            title="What your manager sees"
            description="In solo mode, no one but you can see anything. When/if your company runs a highli server, this page shows the actual manager surface for your org."
            meta="Solo mode"
          />
          <StructuralClaims />
        </AppShell>
        <CmdKPalette />
      </>
    );
  }

  const actor = await getCompanyActor();
  const params = new URLSearchParams({ scope: "company" });
  const [digest, anonThemes, metricThemes] = await Promise.all([
    getDigestForRequest(actor, params),
    getAnonymousThemes(actor, params),
    getMetricThemes(actor, params),
  ]);

  return (
    <>
      <TopStrip goal={null} />
      <AppShell width="wide">
        <PageHeader
          eyebrow="Permanent transparency"
          title="What manager surfaces can show"
          description="Live views below use the same `/org/*` and `/api/anon/*` endpoints managers use. The floor cascade is the protection."
          meta={`${actor.company} · ${digest.scope.reason}`}
        />
        <p className="values-statement">
          highli does not support manager workflows that aggregate or compare
          individual engineers' performance. We support real-time qualitative
          work-history conversations and org-level aggregates for portfolio
          decisions. We do not, and structurally cannot, produce
          performance-review-ready individual reports. Use a different tool for
          that.
        </p>
        <TransparencyClient
          digest={digest}
          anonThemes={anonThemes}
          metricThemes={metricThemes}
        />
      </AppShell>
      <CmdKPalette />
    </>
  );
}

function StructuralClaims() {
  return (
    <ul className="structural-list solo">
      <li>No team-level dashboard exists.</li>
      <li>Smallest renderable scope is a department of at least 25 engineers.</li>
      <li>Company-only fallback requires at least 12 engineers.</li>
      <li>No API endpoint returns individual-named data to manager auth.</li>
    </ul>
  );
}
