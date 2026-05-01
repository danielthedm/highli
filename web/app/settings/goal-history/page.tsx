import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { AppShell, PageHeader } from "@/components/page-header";
import { listGoalHistory, getCurrentGoal } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function GoalHistoryPage() {
  const current = getCurrentGoal();
  const history = listGoalHistory();

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
          backHref="/settings"
          backLabel="settings"
          eyebrow="Career goal"
          title="Goal history"
          description="Every change is a new version. The most recent one is what AI consolidations condition on."
        />

        {history.length === 0 ? (
          <p
            style={{
              marginTop: 32,
              color: "var(--color-text-faint)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            No goals saved yet.
          </p>
        ) : (
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: "32px 0 0",
              borderLeft: "1px solid var(--color-border)",
            }}
          >
            {history.map((g, i) => {
              const isCurrent = i === 0;
              return (
                <li
                  key={g.version}
                  style={{
                    paddingLeft: 16,
                    paddingBottom: 24,
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: -5,
                      top: 4,
                      width: 9,
                      height: 9,
                      borderRadius: 9,
                      background: isCurrent
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                      border: "2px solid var(--color-bg)",
                    }}
                  />
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11.5,
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    v{g.version} · {new Date(g.createdAt).toISOString().split("T")[0]}
                    {isCurrent && (
                      <span
                        style={{
                          marginLeft: 10,
                          color: "var(--color-accent)",
                          textTransform: "uppercase",
                          fontSize: 10.5,
                          letterSpacing: "0.08em",
                        }}
                      >
                        current
                      </span>
                    )}
                  </p>
                  <p
                    className="font-narrative"
                    style={{
                      margin: "6px 0 0",
                      fontSize: 16,
                      lineHeight: 1.45,
                      color: "var(--color-text)",
                    }}
                  >
                    {g.text}
                  </p>
                  {(g.level || g.skills || g.growthAreas) && (
                    <dl
                      style={{
                        margin: "8px 0 0",
                        display: "grid",
                        gridTemplateColumns: "120px 1fr",
                        rowGap: 4,
                        fontSize: 12.5,
                        color: "var(--color-text-dim)",
                      }}
                    >
                      {g.level && (
                        <>
                          <dt style={{ color: "var(--color-text-faint)" }}>level</dt>
                          <dd style={{ margin: 0 }}>{g.level}</dd>
                        </>
                      )}
                      {g.skills && (
                        <>
                          <dt style={{ color: "var(--color-text-faint)" }}>skills</dt>
                          <dd style={{ margin: 0 }}>{g.skills}</dd>
                        </>
                      )}
                      {g.growthAreas && (
                        <>
                          <dt style={{ color: "var(--color-text-faint)" }}>growth</dt>
                          <dd style={{ margin: 0 }}>{g.growthAreas}</dd>
                        </>
                      )}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </AppShell>
      <CmdKPalette />
    </>
  );
}
