"use client";

import type { Attachment } from "ai";
import { useChat } from "ai/react";
import { useState, useEffect, useRef } from "react";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function ReviewChat() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setInput,
  } = useChat({ api: "/api/review/chat" });

  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<Attachment | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  async function handleScreenshot(file: File | undefined) {
    setUploadError(null);
    if (!file) {
      setScreenshot(null);
      return;
    }

    if (!IMAGE_TYPES.has(file.type)) {
      setUploadError("Use a PNG, JPG, GIF, or WebP screenshot.");
      setScreenshot(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const url = await readFileAsDataUrl(file);
    setScreenshot({
      name: file.name,
      contentType: file.type,
      url,
    });
  }

  function submitWithAttachments(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && !screenshot) return;

    handleSubmit(event, {
      experimental_attachments: screenshot ? [screenshot] : undefined,
      allowEmptySubmit: !!screenshot,
    });
    setScreenshot(null);
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleExport() {
    if (!lastAssistant) return;
    setExporting(true);
    setExported(null);
    try {
      const res = await fetch("/api/review/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: lastAssistant.content,
          title: "review",
        }),
      });
      const data = await res.json();
      if (data.path) {
        setExported(data.path);
        try {
          await navigator.clipboard.writeText(lastAssistant.content);
        } catch {
          // clipboard write may be blocked — non-fatal
        }
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 60px)",
      }}
    >
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 24px 16px",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && (
            <div style={{ paddingTop: 32 }}>
              <h1
                className="font-narrative"
                style={{ fontSize: 28, fontWeight: 500, margin: 0 }}
              >
                Draft a review
              </h1>
              <p
                style={{
                  marginTop: 12,
                  color: "var(--color-text-dim)",
                  fontSize: 14.5,
                  lineHeight: 1.6,
                }}
              >
                Paste your review questions or describe what you need. The
                evidence comes from your local timeline; the draft is in your
                voice.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <ChatBubble
              key={m.id}
              role={m.role}
              content={m.content}
              attachments={m.experimental_attachments}
            />
          ))}
          {isLoading && (
            <p
              style={{
                color: "var(--color-text-faint)",
                fontSize: 12.5,
                margin: "8px 0 0",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span className="dot-pulse">…</span>
            </p>
          )}

          {exported && (
            <p
              style={{
                marginTop: 16,
                color: "var(--color-text-dim)",
                fontSize: 12.5,
                fontFamily: "var(--font-mono)",
              }}
            >
              <span style={{ color: "var(--color-accent)" }}>→</span> saved to{" "}
              {exported} (and copied)
            </p>
          )}
        </div>
      </div>

      <form
        onSubmit={submitWithAttachments}
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "16px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: 1, display: "grid", gap: 8 }}>
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() || screenshot) submitWithAttachments(e as any);
                }
              }}
              placeholder="Paste a review question, describe what you need, or attach a screenshot."
              rows={2}
              style={{
                width: "100%",
                background: "var(--color-bg-elevated)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: 14,
                padding: "11px 13px",
                fontSize: 14,
                fontFamily: "var(--font-system)",
                outline: "none",
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
            <div className="review-attachment-row">
              <label className="review-attachment-button">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(e) => {
                    void handleScreenshot(e.target.files?.[0]);
                  }}
                />
                attach screenshot
              </label>
              {screenshot && (
                <span className="review-attachment-chip">
                  {screenshot.name ?? "screenshot attached"}
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshot(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    aria-label="remove screenshot"
                  >
                    remove
                  </button>
                </span>
              )}
              {uploadError && (
                <span className="review-attachment-error">{uploadError}</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !screenshot)}
              style={primaryButton}
            >
              {isLoading ? "…" : "send"}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!lastAssistant || exporting}
              style={ghostButton}
              title="export the latest draft to ~/.highli/reviews/ and clipboard"
            >
              export
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ChatBubble({
  role,
  content,
  attachments,
}: {
  role: string;
  content: string;
  attachments?: Attachment[];
}) {
  const isUser = role === "user";
  return (
    <div style={{ marginBottom: 24 }}>
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: isUser ? "var(--color-text-faint)" : "var(--color-accent)",
          fontWeight: 500,
        }}
      >
        {isUser ? "you" : "highli"}
      </p>
      <div
        className={isUser ? "" : "font-narrative"}
        style={{
          color: "var(--color-text)",
          fontSize: isUser ? 14 : 15.5,
          lineHeight: isUser ? 1.55 : 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {content}
      </div>
      {attachments && attachments.length > 0 && (
        <div className="review-message-attachments">
          {attachments.map((attachment, index) => (
            <span key={`${attachment.name ?? attachment.url}-${index}`}>
              {attachment.name ?? "screenshot"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("could not read screenshot"));
      }
    };
    reader.onerror = () => reject(new Error("could not read screenshot"));
    reader.readAsDataURL(file);
  });
}

const primaryButton: React.CSSProperties = {
  background: "var(--color-text)",
  color: "var(--color-bg)",
  border: "none",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
};

const ghostButton: React.CSSProperties = {
  background: "transparent",
  color: "var(--color-text-dim)",
  border: "1px solid var(--color-border)",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 11.5,
  cursor: "pointer",
};
