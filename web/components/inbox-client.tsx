"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { ManualGroup } from "@highli/core/db";
import type { Event } from "@highli/core/types";
import type { EventGroup } from "@highli/core/ai";

interface InboxClientProps {
  events: Event[];
  starredIds: string[];
  archivedIds: string[];
  manualGroups: ManualGroup[];
  suggestions: EventGroup[];
}

type RowInput = Pick<InboxClientProps, "events" | "manualGroups" | "suggestions">;
type SuggestionStatus = "idle" | "loading" | "ready" | "empty" | "error";

type Row =
  | { kind: "suggestion"; id: string; suggestion: EventGroup }
  | { kind: "event"; id: string; event: Event };

function buildRows(props: RowInput): Row[] {
  // Events that are already in a manual group are removed from the inbox.
  const manualMembers = new Set(props.manualGroups.flatMap((g) => g.eventIds));

  const candidateSuggestions = props.suggestions.filter((s) =>
    s.eventIds.some((id) => !manualMembers.has(id)),
  );

  // Suggestions float to the top — that's the spec ("AI suggests groupings
  // during triage"). Within suggestions, newest event first.
  const eventTs = (id: string) => props.events.find((e) => e.id === id)?.ts ?? 0;
  candidateSuggestions.sort((a, b) => {
    const aLast = Math.max(0, ...a.eventIds.map(eventTs));
    const bLast = Math.max(0, ...b.eventIds.map(eventTs));
    return bLast - aLast;
  });

  const suggestionRows: Row[] = candidateSuggestions.map((s, i) => ({
    kind: "suggestion" as const,
    id: `s-${i}`,
    suggestion: s,
  }));

  const eventRows: Row[] = props.events
    .filter((e) => !manualMembers.has(e.id))
    .map((e) => ({ kind: "event" as const, id: `e-${e.id}`, event: e }));

  return [...suggestionRows, ...eventRows];
}

export function InboxClient(props: InboxClientProps) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<EventGroup[]>(props.suggestions);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>(
    props.suggestions.length > 0 ? "ready" : "idle",
  );
  const [focused, setFocused] = useState(0);
  const [starSet, setStarSet] = useState<Set<string>>(new Set(props.starredIds));
  const [archivedSet, setArchivedSet] = useState<Set<string>>(
    new Set(props.archivedIds),
  );
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState<{ from: Event } | null>(null);
  const [editing, setEditing] = useState<{ rowId: string; framing: string } | null>(null);
  const [mergeFilter, setMergeFilter] = useState("");
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const focusRef = useRef<HTMLLIElement | null>(null);

  const rows = useMemo(
    () =>
      buildRows({
        events: props.events,
        manualGroups: props.manualGroups,
        suggestions,
      }),
    [props.events, props.manualGroups, suggestions],
  );

  // Refresh rows when props change (e.g. after router.refresh()).
  useEffect(() => {
    setSuggestions(props.suggestions);
    setSuggestionStatus(props.suggestions.length > 0 ? "ready" : "idle");
    setStarSet(new Set(props.starredIds));
    setArchivedSet(new Set(props.archivedIds));
    setRejected(new Set());
  }, [
    props.archivedIds,
    props.events,
    props.manualGroups,
    props.starredIds,
    props.suggestions,
  ]);

  const visibleRows = useMemo(
    () => rows.filter((r) => r.kind !== "suggestion" || !rejected.has(r.id)),
    [rows, rejected],
  );

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  useEffect(() => {
    if (props.events.length === 0) {
      setSuggestionStatus("empty");
      return;
    }

    let cancelled = false;
    setSuggestionStatus("loading");

    async function loadSuggestions() {
      try {
        const res = await fetch("/api/inbox/suggestions", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { suggestions?: EventGroup[] };
        if (cancelled) return;
        const next = Array.isArray(data.suggestions) ? data.suggestions : [];
        setSuggestions(next);
        setSuggestionStatus(next.length > 0 ? "ready" : "empty");
        setRejected(new Set());
      } catch {
        if (!cancelled) setSuggestionStatus("error");
      }
    }

    void loadSuggestions();

    return () => {
      cancelled = true;
    };
  }, [props.events, props.manualGroups]);

  function showFlash(msg: string, tone: "ok" | "err" = "ok") {
    setFlash({ msg, tone });
    setTimeout(() => setFlash(null), 1200);
  }

  function move(delta: number) {
    setFocused((cur) =>
      Math.max(0, Math.min(visibleRows.length - 1, cur + delta)),
    );
  }

  async function togglePin(eventId: string) {
    const next = !starSet.has(eventId);
    setStarSet((prev) => {
      const s = new Set(prev);
      next ? s.add(eventId) : s.delete(eventId);
      return s;
    });
    start(async () => {
      try {
        await fetch("/api/stars", {
          method: next ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
        showFlash(next ? "pinned" : "unpinned");
      } catch {
        showFlash("network error", "err");
      }
    });
  }

  async function toggleArchive(eventId: string) {
    const next = !archivedSet.has(eventId);
    setArchivedSet((prev) => {
      const s = new Set(prev);
      next ? s.add(eventId) : s.delete(eventId);
      return s;
    });
    start(async () => {
      try {
        await fetch("/api/archive", {
          method: next ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
        showFlash(next ? "hidden from consolidated views" : "unhidden");
      } catch {
        showFlash("network error", "err");
      }
    });
  }

  async function acceptSuggestion(
    rowId: string,
    suggestion: EventGroup,
    framingOverride?: string,
  ) {
    const framing = (framingOverride ?? suggestion.framing).trim();
    if (!framing) {
      showFlash("framing can't be empty", "err");
      return;
    }
    start(async () => {
      try {
        const res = await fetch("/api/groups", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            framing,
            eventIds: suggestion.eventIds,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        showFlash(
          framingOverride
            ? "group accepted with edited framing"
            : "group accepted — visible in timeline",
        );
        setEditing(null);
        router.refresh();
      } catch (err: any) {
        showFlash(err?.message ?? "couldn't accept", "err");
      }
    });
  }

  function rejectSuggestion(rowId: string) {
    setRejected((prev) => new Set(prev).add(rowId));
    showFlash("suggestion dismissed");
    setFocused((cur) => Math.max(0, cur - (cur === visibleRows.length - 1 ? 1 : 0)));
  }

  async function performMerge(targetGroupId: number, fromEvent: Event) {
    start(async () => {
      try {
        const res = await fetch("/api/groups", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ groupId: targetGroupId, eventId: fromEvent.id }),
        });
        if (!res.ok) throw new Error(await res.text());
        setMerging(null);
        setMergeFilter("");
        showFlash("merged into existing group");
        router.refresh();
      } catch (err: any) {
        showFlash(err?.message ?? "couldn't merge", "err");
      }
    });
  }

  // ── Keyboard handler ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Modal flows take priority — let their own onKeyDown handle input.
      if (merging || editing) return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      const row = visibleRows[focused];
      if (!row) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "g":
          e.preventDefault();
          setFocused(0);
          break;
        case "G":
          e.preventDefault();
          setFocused(visibleRows.length - 1);
          break;
        case "p":
          if (row.kind === "event") {
            e.preventDefault();
            togglePin(row.event.id);
          }
          break;
        case "a":
          if (row.kind === "event") {
            e.preventDefault();
            toggleArchive(row.event.id);
          }
          break;
        case "m":
          if (row.kind === "event" && props.manualGroups.length > 0) {
            e.preventDefault();
            setMerging({ from: row.event });
          }
          break;
        case "e":
          if (row.kind === "suggestion") {
            e.preventDefault();
            setEditing({ rowId: row.id, framing: row.suggestion.framing });
          }
          break;
        case "Enter":
          if (row.kind === "suggestion") {
            e.preventDefault();
            acceptSuggestion(row.id, row.suggestion);
          }
          break;
        case "x":
          if (row.kind === "suggestion") {
            e.preventDefault();
            rejectSuggestion(row.id);
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, visibleRows, merging, editing, props.manualGroups]);

  const filteredGroups = useMemo(() => {
    const q = mergeFilter.trim().toLowerCase();
    if (!q) return props.manualGroups;
    return props.manualGroups.filter((g) =>
      g.framing.toLowerCase().includes(q),
    );
  }, [mergeFilter, props.manualGroups]);

  return (
    <div style={{ position: "relative" }}>
      <KeyboardLegend manualGroupsCount={props.manualGroups.length} />
      <SuggestionStatusLine status={suggestionStatus} count={suggestions.length} />

      {visibleRows.length === 0 ? (
        <p
          style={{
            color: "var(--color-text-faint)",
            fontSize: 13,
            margin: "32px 0",
            fontStyle: "italic",
          }}
        >
          nothing to triage right now.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visibleRows.map((row, i) => {
            const isFocused = i === focused;
            return (
              <li
                key={row.id}
                ref={isFocused ? focusRef : undefined}
                onMouseEnter={() => setFocused(i)}
                style={{
                  borderLeft: isFocused
                    ? "2px solid var(--color-accent)"
                    : "2px solid transparent",
                  background: isFocused ? "var(--color-bg-elevated)" : "transparent",
                  padding: "10px 12px 10px 14px",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  transition: "background 120ms",
                }}
              >
                {row.kind === "suggestion" ? (
                  editing && editing.rowId === row.id ? (
                    <SuggestionEditor
                      framing={editing.framing}
                      onChange={(v) =>
                        setEditing((cur) => (cur ? { ...cur, framing: v } : cur))
                      }
                      onCommit={() =>
                        acceptSuggestion(row.id, row.suggestion, editing.framing)
                      }
                      onCancel={() => setEditing(null)}
                      memberCount={row.suggestion.eventIds.length}
                    />
                  ) : (
                    <SuggestionRow
                      suggestion={row.suggestion}
                      events={props.events}
                      focused={isFocused}
                    />
                  )
                ) : (
                  <EventRow
                    event={row.event}
                    starred={starSet.has(row.event.id)}
                    archived={archivedSet.has(row.event.id)}
                    focused={isFocused}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AnimatePresence>
        {merging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(8,7,5,0.66)",
              backdropFilter: "blur(4px)",
              zIndex: 50,
            }}
            onClick={() => setMerging(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: "20%",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(560px, calc(100vw - 32px))",
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--color-text-faint)",
                }}
              >
                merge into existing group
              </p>
              <p
                className="font-narrative"
                style={{
                  margin: "0 0 12px",
                  fontSize: 14,
                  color: "var(--color-text-dim)",
                }}
              >
                "{merging.from.title}"
              </p>
              <input
                autoFocus
                value={mergeFilter}
                onChange={(e) => setMergeFilter(e.target.value)}
                placeholder="filter by group framing — ↵ to merge into top match · esc to cancel"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (filteredGroups[0]) {
                      performMerge(filteredGroups[0].id, merging.from);
                    }
                  } else if (e.key === "Escape") {
                    setMerging(null);
                    setMergeFilter("");
                  }
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  padding: "10px 12px",
                  color: "var(--color-text)",
                  fontSize: 13,
                  outline: "none",
                  marginBottom: 12,
                }}
              />
              <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 280, overflowY: "auto" }}>
                {filteredGroups.length === 0 && (
                  <li style={{ color: "var(--color-text-faint)", fontSize: 12.5, padding: 8 }}>
                    no groups match.
                  </li>
                )}
                {filteredGroups.map((g, i) => (
                  <li
                    key={g.id}
                    onClick={() => performMerge(g.id, merging.from)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 13,
                      cursor: "pointer",
                      color: "var(--color-text-dim)",
                      borderRadius: 4,
                      background: i === 0 ? "var(--color-surface)" : "transparent",
                    }}
                  >
                    <span className="font-narrative">{g.framing}</span>
                    <span
                      style={{
                        color: "var(--color-text-faint)",
                        fontSize: 11,
                        marginLeft: 8,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {g.eventIds.length} events
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {flash && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderLeft:
              flash.tone === "err"
                ? "2px solid var(--color-danger, #c0563a)"
                : "2px solid var(--color-accent)",
            padding: "8px 14px",
            borderRadius: 4,
            fontSize: 12.5,
            color: "var(--color-text)",
            zIndex: 60,
            opacity: pending ? 0.85 : 1,
          }}
        >
          {flash.msg}
        </div>
      )}
    </div>
  );
}

function SuggestionStatusLine({
  status,
  count,
}: {
  status: SuggestionStatus;
  count: number;
}) {
  if (status === "idle") return null;

  const text =
    status === "loading"
      ? "checking for AI grouping suggestions in the background..."
      : status === "error"
        ? "AI grouping suggestions are unavailable; the raw inbox is still usable."
        : status === "ready"
          ? `${count} AI grouping suggestion${count === 1 ? "" : "s"} ready.`
          : "no AI grouping suggestions right now.";

  return (
    <p
      style={{
        margin: "-6px 0 18px",
        color: status === "error" ? "var(--color-danger, #b45309)" : "var(--color-text-faint)",
        fontFamily: "var(--font-mono)",
        fontSize: 11.5,
        letterSpacing: "0.02em",
      }}
    >
      {text}
    </p>
  );
}

function KeyboardLegend({ manualGroupsCount }: { manualGroupsCount: number }) {
  return (
    <p
      style={{
        margin: "0 0 16px",
        fontSize: 11.5,
        color: "var(--color-text-faint)",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.02em",
      }}
    >
      <Key>j</Key>/<Key>k</Key> move · <Key>p</Key> pin · <Key>a</Key> archive
      {manualGroupsCount > 0 && (<> · <Key>m</Key> merge</>)}
      {" · "}
      <Key>↵</Key> accept group · <Key>e</Key> edit framing · <Key>x</Key> reject
    </p>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 3,
        padding: "1px 5px",
        fontSize: 11,
        color: "var(--color-text-dim)",
        margin: "0 1px",
      }}
    >
      {children}
    </span>
  );
}

function SuggestionRow({
  suggestion,
  events,
  focused,
}: {
  suggestion: EventGroup;
  events: Event[];
  focused: boolean;
}) {
  const matchedEvents = suggestion.eventIds
    .map((id) => events.find((e) => e.id === id))
    .filter((e): e is Event => !!e);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <span
          style={{
            color: "var(--color-accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            width: 76,
            flexShrink: 0,
          }}
        >
          AI suggests
        </span>
        <p
          className="font-narrative"
          style={{
            margin: 0,
            color: "var(--color-text)",
            fontSize: 15,
            lineHeight: 1.4,
          }}
        >
          {suggestion.framing}
        </p>
      </div>
      <p
        style={{
          margin: "6px 0 0 92px",
          fontSize: 12,
          color: "var(--color-text-faint)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {suggestion.eventIds.length} events
        {focused && (
          <>
            {" "}
            · <Key>↵</Key> accept · <Key>e</Key> edit · <Key>x</Key> reject
          </>
        )}
      </p>
      {focused && matchedEvents.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "8px 0 0 92px",
            borderLeft: "1px solid var(--color-border)",
          }}
        >
          {matchedEvents.slice(0, 8).map((e) => (
            <li
              key={e.id}
              style={{
                padding: "3px 0 3px 12px",
                fontSize: 12,
                color: "var(--color-text-dim)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-faint)",
                  fontSize: 11,
                  marginRight: 8,
                }}
              >
                {fmtDate(e.ts)}
              </span>
              {e.title}
            </li>
          ))}
          {matchedEvents.length > 8 && (
            <li style={{ padding: "3px 0 3px 12px", fontSize: 11.5, color: "var(--color-text-faint)" }}>
              + {matchedEvents.length - 8} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function EventRow({
  event,
  starred,
  archived,
  focused,
}: {
  event: Event;
  starred: boolean;
  archived: boolean;
  focused: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "baseline", opacity: archived ? 0.55 : 1 }}>
      <span
        style={{
          color: "var(--color-text-faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          width: 76,
          flexShrink: 0,
        }}
      >
        {fmtDate(event.ts)}
      </span>
      <span
        style={{
          color: "var(--color-text-faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          width: 56,
          flexShrink: 0,
        }}
      >
        {labelForType(event.type)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: "var(--color-text)", fontSize: 13.5 }}>
          {event.title}
          {starred && (
            <span style={{ color: "var(--color-accent)", marginLeft: 6 }}>★</span>
          )}
          {archived && (
            <span
              style={{
                color: "var(--color-text-faint)",
                marginLeft: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              hidden
            </span>
          )}
        </p>
        {event.summary && (
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-faint)" }}>
            {event.summary}
          </p>
        )}
      </div>
    </div>
  );
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function labelForType(t: string): string {
  if (t === "pr_authored") return "pr";
  if (t === "pr_reviewed") return "review";
  return t;
}

function SuggestionEditor({
  framing,
  onChange,
  onCommit,
  onCancel,
  memberCount,
}: {
  framing: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  memberCount: number;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Place caret at end so the engineer can append/refine, not retype.
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <span
          style={{
            color: "var(--color-accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            width: 76,
            flexShrink: 0,
          }}
        >
          editing
        </span>
        <textarea
          ref={inputRef}
          value={framing}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onCommit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid var(--color-accent)",
            borderRadius: 4,
            padding: "8px 10px",
            color: "var(--color-text)",
            fontFamily: "var(--font-narrative)",
            fontSize: 15,
            lineHeight: 1.4,
            outline: "none",
            resize: "vertical",
          }}
        />
      </div>
      <p
        style={{
          margin: "6px 0 0 92px",
          fontSize: 12,
          color: "var(--color-text-faint)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {memberCount} events · <Key>↵</Key> accept with edit ·{" "}
        <Key>shift+↵</Key> newline · <Key>esc</Key> cancel
      </p>
    </div>
  );
}
