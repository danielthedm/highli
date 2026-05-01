"use client";

import { motion } from "framer-motion";
import type { WeeklyHighlight } from "@highli/core/ai";
import type { DisplayEvent } from "@/lib/display-event";
import { StarButton } from "./star-button";

export function HighlightsSection({
  highlights,
  events,
  starredIds,
}: {
  highlights: WeeklyHighlight[];
  events: DisplayEvent[];
  starredIds: string[];
}) {
  if (highlights.length === 0) {
    return (
      <p className="quiet-empty">
        a quiet week — nothing surfaced.
      </p>
    );
  }

  const starSet = new Set(starredIds);

  return (
    <div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="eyebrow-pill"
        style={{ marginBottom: 14 }}
      >
        {`${wordsCount(highlights.length)} surfaced item${highlights.length === 1 ? "" : "s"}`}
      </motion.p>
      <ul className="highlights-list">
        {highlights.map((h, i) => {
          const event = events.find((e) => e.id === h.eventId);
          const isStarred = starSet.has(h.eventId);
          return (
            <motion.li
              key={h.eventId + i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.12, duration: 0.45 }}
              className="highlight-card"
            >
              <span className="highlight-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="highlight-title">
                  {h.title}
                </p>
                <p className="highlight-copy">
                  {h.oneLiner}
                </p>
                {event?.url && (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="metadata-pill"
                  >
                    {shortUrl(event.url)}
                  </a>
                )}
              </div>
              <span
                className={`star-slot${isStarred ? " is-starred" : ""}`}
              >
                <StarButton
                  eventId={h.eventId}
                  initialStarred={isStarred}
                />
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function wordsCount(n: number): string {
  switch (n) {
    case 1:
      return "one";
    case 2:
      return "two";
    case 3:
      return "three";
    case 4:
      return "four";
    default:
      return String(n);
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}
