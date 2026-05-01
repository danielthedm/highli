"use client";

import { useMemo, useState } from "react";

const tabs = ["Weekly digest", "Org rollups", "Surveys"] as const;

export function TransparencyClient({
  digest,
  anonThemes,
  metricThemes,
}: {
  digest: any;
  anonThemes: any;
  metricThemes: any;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Weekly digest");
  const [query, setQuery] = useState("");
  const refusal = useMemo(() => {
    if (!query.trim()) return null;
    return "No surface in this product produces this result, by design.";
  }, [query]);

  return (
    <div className="transparency-grid">
      <section className="transparency-main">
        <div className="tab-row">
          {tabs.map((item) => (
            <button
              key={item}
              className={item === tab ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <label className="search-demo">
          <span>Search the manager view</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Show me Alex, compare two engineers, show platform team"
          />
        </label>
        {refusal && <p className="refusal">{refusal}</p>}

        {tab === "Weekly digest" && (
          <div className="manager-digest-list">
            {[...(anonThemes.themes ?? []), ...(metricThemes.themes ?? [])].map((theme: any) => (
              <article key={theme.id} className="theme-row">
                <p className="theme-title">{theme.title}</p>
                <p className="theme-copy">
                  {theme.composite_excerpt ?? theme.hypothesis ?? "No manager-visible individual data."}
                </p>
              </article>
            ))}
            {(anonThemes.themes ?? []).length === 0 && (metricThemes.themes ?? []).length === 0 && (
              <p className="quiet-copy">No manager-visible themes at this scope.</p>
            )}
          </div>
        )}

        {tab === "Org rollups" && (
          <pre className="json-panel">{JSON.stringify(digest.digest ?? digest.scope, null, 2)}</pre>
        )}

        {tab === "Surveys" && (
          <div className="theme-row">
            <p className="theme-title">Anonymous survey aggregates</p>
            <p className="theme-copy">
              Survey responses use identity-free anonymous tables and render only after
              the same floor cascade passes.
            </p>
          </div>
        )}

        <section className="structural-list">
          <h2>Structurally impossible</h2>
          <ul>
            <li>No team-level dashboard exists.</li>
            <li>No endpoint returns individual-named manager data.</li>
            <li>No comparison view or leaderboard exists.</li>
            <li>Sub-floor queries return reason codes instead of hidden rows.</li>
          </ul>
        </section>
      </section>

      <aside className="annotation-gutter">
        <p><strong>What this is</strong><br />A live manager-surface mock using the same `/org/*` endpoints.</p>
        <p><strong>What this is not</strong><br />It is not a screenshot and not a privileged manager bypass.</p>
        <p><strong>Floor cascade</strong><br />Current reason: {digest.scope?.reason ?? "ok"}.</p>
        <p><strong>Your data</strong><br />Your individual contribution can affect aggregates, but it does not appear by name.</p>
      </aside>
    </div>
  );
}
