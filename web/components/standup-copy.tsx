"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function StandupCopy({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="standup-copy-button" type="button" onClick={copy}>
      <Copy aria-hidden="true" size={14} strokeWidth={2.3} />
      <span>{copied ? "copied" : "copy for standup"}</span>
    </button>
  );
}
