import Link from "next/link";
import type { ReactNode } from "react";
import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCurrentGoal, getDbPath } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const current = getCurrentGoal();
  const goal = current?.text ?? null;

  return (
    <>
      <TopStrip
        goal={goal}
        level={current?.level}
        skills={current?.skills}
        growthAreas={current?.growthAreas}
      />
      <AppShell width="narrow">
        <PageHeader
          eyebrow="Workspace"
          title="Settings"
          description="Local setup and career-goal context for this machine."
          meta={
            <>
              Local store
              <br />
              <code>{getDbPath()}</code>
            </>
          }
        />

        <Section title="Career goal">
          {goal ? (
            <div>
              <p
                className="font-narrative"
                style={{
                  margin: 0,
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: "var(--color-text)",
                }}
              >
                {goal}
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  color: "var(--color-text-faint)",
                }}
              >
                Editable inline from the top strip ↑ ·{" "}
                <Link
                  href="/settings/goal-history"
                  style={{ color: "inherit" }}
                >
                  goal history →
                </Link>
              </p>
            </div>
          ) : (
            <p
              style={{
                color: "var(--color-text-dim)",
                fontSize: 13.5,
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              Not set. Click the top strip to set one — every consolidation
              conditions on it.
            </p>
          )}
        </Section>

        <Section title="Sources">
          <p
            style={{
              color: "var(--color-text-dim)",
              fontSize: 13.5,
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            Configured via{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>highli setup</code> in
            the terminal.
          </p>
        </Section>
      </AppShell>
      <CmdKPalette />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 12,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-faint)",
          margin: "0 0 12px",
          fontWeight: 500,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
