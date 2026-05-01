"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { ManualGroup } from "@highli/core/db";
import type { EventGroup } from "@highli/core/ai";
import type { DisplayEvent } from "@/lib/display-event";

interface TimelineProps {
  events: DisplayEvent[];
  aiGroups: EventGroup[];
  manualGroups: ManualGroup[];
  starredIds: string[];
  archivedIds: string[];
}

interface TimelineRow {
  kind: "ai-group" | "manual-group" | "flat";
  framing?: string;
  events: DisplayEvent[];
  manualGroupId?: number;
}

function buildRows(
  events: DisplayEvent[],
  aiGroups: EventGroup[],
  manualGroups: ManualGroup[],
): TimelineRow[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const groupedIds = new Set<string>();

  // Manual groups take precedence — anchor first.
  const manualRows: TimelineRow[] = manualGroups
    .map((g) => {
      const groupEvents = g.eventIds
        .map((id) => eventById.get(id))
        .filter((e): e is DisplayEvent => !!e)
        .sort((a, b) => b.ts - a.ts);
      groupEvents.forEach((e) => groupedIds.add(e.id));
      return {
        kind: "manual-group" as const,
        framing: g.framing,
        events: groupEvents,
        manualGroupId: g.id,
      };
    })
    .filter((r) => r.events.length >= 2);

  const aiRows: TimelineRow[] = aiGroups
    .map((g) => {
      const groupEvents = g.eventIds
        .filter((id) => !groupedIds.has(id))
        .map((id) => eventById.get(id))
        .filter((e): e is DisplayEvent => !!e)
        .sort((a, b) => b.ts - a.ts);
      groupEvents.forEach((e) => groupedIds.add(e.id));
      return { kind: "ai-group" as const, framing: g.framing, events: groupEvents };
    })
    .filter((r) => r.events.length >= 2);

  const flatRows: TimelineRow[] = events
    .filter((e) => !groupedIds.has(e.id))
    .map((e) => ({ kind: "flat" as const, events: [e] }));

  return [...manualRows, ...aiRows, ...flatRows].sort((a, b) => {
    const aTs = a.events[0]?.ts ?? 0;
    const bTs = b.events[0]?.ts ?? 0;
    return bTs - aTs;
  });
}

export function Timeline({
  events,
  aiGroups,
  manualGroups,
  starredIds,
  archivedIds,
}: TimelineProps) {
  const rows = buildRows(events, aiGroups, manualGroups);
  const starSet = new Set(starredIds);
  const archivedSet = new Set(archivedIds);

  if (rows.length === 0) {
    return (
      <p className="quiet-empty">
        no events captured locally yet.
      </p>
    );
  }

  return (
    <ul className="timeline-list">
      {rows.map((row, i) => {
        if (row.kind === "manual-group" || row.kind === "ai-group") {
          return (
            <SuperEntry
              key={`${row.kind}-${i}`}
              framing={row.framing!}
              events={row.events}
              manual={row.kind === "manual-group"}
              starSet={starSet}
              archivedSet={archivedSet}
            />
          );
        }
        return (
          <FlatEntry
            key={`f-${i}-${row.events[0].id}`}
            event={row.events[0]}
            starred={starSet.has(row.events[0].id)}
            archived={archivedSet.has(row.events[0].id)}
          />
        );
      })}
    </ul>
  );
}

function FlatEntry({
  event,
  starred,
  archived,
}: {
  event: DisplayEvent;
  starred: boolean;
  archived: boolean;
}) {
  return (
    <li
      className="timeline-entry"
      style={{ opacity: archived ? 0.5 : 1 }}
    >
      <div className="timeline-meta">
        <span>{fmtDate(event.ts)}</span>
        <span className="timeline-type">{labelForType(event.type)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="timeline-title">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {event.title}
            </a>
          ) : (
            event.title
          )}
          {starred && (
            <span style={{ color: "var(--color-accent)", marginLeft: 6 }}>★</span>
          )}
          {archived && (
            <span className="status-chip">
              hidden
            </span>
          )}
        </p>
        {event.summary && (
          <p className="timeline-summary">
            {event.summary}
          </p>
        )}
      </div>
    </li>
  );
}

function SuperEntry({
  framing,
  events,
  manual,
  starSet,
  archivedSet,
}: {
  framing: string;
  events: DisplayEvent[];
  manual: boolean;
  starSet: Set<string>;
  archivedSet: Set<string>;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="timeline-group"
    >
      <div className="timeline-group-header">
        <div className="timeline-meta">
          <span>{fmtDate(events[0]?.ts ?? Date.now())}</span>
          <span className="timeline-type">{manual ? "manual" : "group"}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="timeline-group-title">
            {framing}
          </p>
          <p className="timeline-count">
            {events.length} events{manual ? " · manual" : ""}
          </p>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hovered && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="timeline-children"
          >
            {events.slice(0, 12).map((e) => (
              <li
                key={e.id}
                className="timeline-child"
                style={{ opacity: archivedSet.has(e.id) ? 0.5 : 1 }}
              >
                <span className="timeline-child-date">
                  {fmtDate(e.ts)}
                </span>
                {e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {e.title}
                  </a>
                ) : (
                  e.title
                )}
                {starSet.has(e.id) && (
                  <span style={{ color: "var(--color-accent)", marginLeft: 6 }}>★</span>
                )}
              </li>
            ))}
            {events.length > 12 && (
              <li
                className="timeline-child"
              >
                + {events.length - 12} more
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function labelForType(type: string): string {
  switch (type) {
    case "pr_authored":
      return "pr";
    case "pr_reviewed":
      return "review";
    case "commit":
      return "commit";
    default:
      return type;
  }
}
