"use client";

import { motion } from "framer-motion";
import type { Insight } from "@highli/core/ai";
import type { DisplayEvent } from "@/lib/display-event";

export const INSIGHT_THRESHOLD = 0.6;

export function ForgottenCallout({
  insight,
  events,
}: {
  insight: Insight;
  events: DisplayEvent[];
}) {
  if (insight.confidence < INSIGHT_THRESHOLD) return null;
  const matched = insight.eventId
    ? events.find((e) => e.id === insight.eventId)
    : undefined;

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      // The held animation: section appears after the headline highlights
      // settle, signaling that the AI noticed something extra.
      transition={{ delay: 1.4, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="forgotten-callout"
    >
      <p className="forgotten-label">
        1 thing you might've forgotten
      </p>
      <p className="forgotten-title">
        {insight.callout}
      </p>
      {matched?.url && (
        <a
          href={matched.url}
          target="_blank"
          rel="noopener noreferrer"
          className="metadata-pill"
        >
          {matched.url}
        </a>
      )}
      <p className="forgotten-reason">
        {insight.reasoning}
      </p>
    </motion.aside>
  );
}
