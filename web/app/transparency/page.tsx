import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCurrentGoal } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "highli — what your manager sees",
};

export default function TransparencyPage() {
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
          meta="Live org views must pass k-floor privacy checks."
        />

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            color: "var(--color-text-dim)",
            fontSize: 13.5,
            lineHeight: 1.7,
          }}
        >
          <li>
            <span style={{ color: "var(--color-accent)" }}>—</span> No team-level
            dashboard exists.
          </li>
          <li>
            <span style={{ color: "var(--color-accent)" }}>—</span> Smallest
            renderable scope is a department of ≥25 engineers (or company-only
            for small orgs).
          </li>
          <li>
            <span style={{ color: "var(--color-accent)" }}>—</span> No API
            endpoint returns individual-named data to a manager auth.
          </li>
        </ul>
      </AppShell>
      <CmdKPalette />
    </>
  );
}
