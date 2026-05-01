"use client";

import { useState, useTransition } from "react";

type Preview = {
  stored: boolean;
  trackingToken: string | null;
  classification: {
    category: string;
    redactedText: string;
    redactions: Array<{ original: string; replacement: string }>;
  };
  redirect?: string;
  routes?: string[];
};

export function FrustrationFlow({ initialDraft = "" }: { initialDraft?: string }) {
  const [text, setText] = useState(initialDraft);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sent, setSent] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(previewOnly: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/anon/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, previewOnly }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Submission could not be processed.");
        return;
      }
      if (previewOnly) setPreview(json);
      else setSent(json);
    });
  }

  if (sent) {
    return (
      <section className="anon-panel">
        <p className="anon-kicker">Done.</p>
        <h1 className="anon-title">The redacted version was sent.</h1>
        {sent.trackingToken && (
          <p className="anon-copy">
            Tracking token: <code>{sent.trackingToken}</code>
          </p>
        )}
      </section>
    );
  }

  return (
    <main className="anon-flow">
      <section className="anon-panel">
        <p className="anon-kicker">anonymous register</p>
        <h1 className="anon-title">What is bothering you?</h1>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Describe the friction. Names and identifying details are removed before anything is stored."
          className="anon-textarea"
        />
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button
            className="button button-primary"
            disabled={pending || text.trim().length < 5}
            onClick={() => submit(true)}
          >
            {pending ? "reviewing" : "review before sending"}
          </button>
        </div>
      </section>

      {preview && (
        <section className="anon-comparison" aria-label="Redaction preview">
          <div>
            <p className="anon-kicker">original</p>
            <div className="anon-draft">{text}</div>
          </div>
          <div>
            <p className="anon-kicker">stored version</p>
            <div className="anon-draft redacted">{preview.classification.redactedText}</div>
            <p className="anon-copy">Category: {preview.classification.category}</p>
            {preview.redirect && (
              <p className="anon-copy">
                This is HR territory and will not be stored. Use the configured process:
                {" "}
                <a href={preview.redirect}>{preview.redirect}</a>
              </p>
            )}
            {preview.routes && (
              <p className="anon-copy">
                This names a relationship, so it stays out of aggregates. Choose a
                private note, rephrase to systemic, or use a direct channel.
              </p>
            )}
            {!preview.redirect && !preview.routes && (
              <div className="form-actions">
                <button className="button" onClick={() => setPreview(null)}>
                  edit further
                </button>
                <button className="button button-primary" onClick={() => submit(false)}>
                  send redacted version
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
