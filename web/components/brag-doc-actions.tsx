"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BragDocActions({ hasDocument }: { hasDocument: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/brag/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error ?? "failed to generate brag doc");
      }
      setMessage(data?.message ?? "Brag doc updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to generate brag doc");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="doc-action-panel">
      <button
        type="button"
        className="doc-action-button"
        onClick={generate}
        disabled={pending}
      >
        {pending
          ? hasDocument
            ? "Amending doc..."
            : "Generating doc..."
          : hasDocument
            ? "Amend from timeline"
            : "Generate from timeline"}
      </button>
      <p className="doc-action-copy">
        {hasDocument
          ? "Adds new raw timeline evidence to the same living brag doc."
          : "Creates the first living brag doc from your raw timeline."}
      </p>
      {message && <p className="doc-action-status">{message}</p>}
      {error && <p className="doc-action-error">{error}</p>}
    </div>
  );
}
