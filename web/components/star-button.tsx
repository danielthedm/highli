"use client";

import { useState, useTransition } from "react";

export function StarButton({
  eventId,
  initialStarred,
}: {
  eventId: string;
  initialStarred: boolean;
}) {
  const [starred, setStarred] = useState(initialStarred);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !starred;
    setStarred(next);
    start(async () => {
      try {
        await fetch("/api/stars", {
          method: next ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
      } catch {
        setStarred(!next);
      }
    });
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={starred}
      aria-label={starred ? "unstar" : "star"}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 4,
        color: starred ? "var(--color-accent)" : "var(--color-text-faint)",
        fontSize: 14,
        opacity: pending ? 0.5 : 1,
        transition: "color 200ms",
      }}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}
