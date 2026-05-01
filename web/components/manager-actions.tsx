"use client";

import { useState, useTransition } from "react";

export function ManagerThemeActions({
  themeSource,
  themeId,
}: {
  themeSource: "anon" | "metric" | "combined";
  themeId: string;
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(action: "acknowledge" | "addressing" | "not-real-signal") {
    startTransition(async () => {
      const res = await fetch("/api/manager/theme-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ themeSource, themeId, action, note: note || undefined }),
      });
      setStatus(res.ok ? "saved" : "could not save");
    });
  }

  return (
    <div className="manager-actions">
      <button disabled={pending} onClick={() => send("acknowledge")}>
        Acknowledge
      </button>
      <button disabled={pending} onClick={() => send("addressing")}>
        Mark addressing
      </button>
      {themeSource === "metric" && (
        <button disabled={pending} onClick={() => send("not-real-signal")}>
          Not a real signal
        </button>
      )}
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="status note"
      />
      {status && <span>{status}</span>}
    </div>
  );
}
