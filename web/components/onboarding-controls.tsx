"use client";

import { useState, useTransition } from "react";

const states = ["setup", "communication", "preview", "live", "warmup", "active"] as const;

export function OnboardingControls({ state }: { state: string }) {
  const [current, setCurrent] = useState(state);
  const [pending, startTransition] = useTransition();
  const index = states.indexOf(current as any);
  const next = states[index + 1];

  function advance() {
    if (!next) return;
    startTransition(async () => {
      const res = await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ next }),
      });
      const json = await res.json();
      if (res.ok) setCurrent(json.install.state);
    });
  }

  return (
    <div className="onboarding-steps">
      {states.map((item) => (
        <span key={item} className={item === current ? "active" : ""}>
          {item}
        </span>
      ))}
      <button className="button button-primary" disabled={!next || pending} onClick={advance}>
        {next ? `advance to ${next}` : "active"}
      </button>
    </div>
  );
}
