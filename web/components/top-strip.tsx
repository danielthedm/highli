"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { primaryNavItems } from "@/lib/navigation";

interface TopStripProps {
  goal: string | null;
  level?: string | null;
  skills?: string | null;
  growthAreas?: string | null;
}

export function TopStrip({ goal, level, skills, growthAreas }: TopStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal ?? "");
  const [levelV, setLevelV] = useState(level ?? "");
  const [skillsV, setSkillsV] = useState(skills ?? "");
  const [growthV, setGrowthV] = useState(growthAreas ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  function save() {
    if (!text.trim()) {
      setError("a goal needs at least one sentence.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/goal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            level: levelV.trim() || undefined,
            skills: skillsV.trim() || undefined,
            growthAreas: growthV.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        setEditing(false);
        router.refresh();
      } catch (err: any) {
        setError(err?.message ?? "couldn't save");
      }
    });
  }

  function cancel() {
    setText(goal ?? "");
    setLevelV(level ?? "");
    setSkillsV(skills ?? "");
    setGrowthV(growthAreas ?? "");
    setError(null);
    setEditing(false);
  }

  return (
    <header className="top-strip">
      <div className="top-strip-inner">
        <Link
          href="/"
          className="wordmark"
        >
          <span className="wordmark-mark">h</span>
          <span>highli</span>
        </Link>

        <nav className="top-nav" aria-label="Primary">
          {primaryNavItems.map((item) => {
            const active =
              pathname === item.href || pathname?.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`top-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1, minWidth: 0 }}>
          {!editing && goal && (
            <button
              onClick={() => setEditing(true)}
              title="edit your career goal"
              className="goal-button has-goal"
            >
              {goal}
            </button>
          )}
          {!editing && !goal && (
            <button
              onClick={() => setEditing(true)}
              className="goal-button goal-placeholder"
            >
              set a career goal
            </button>
          )}
        </div>

        <div className="top-actions">
          <Link href="/settings" className="settings-link">
            settings
          </Link>
          <span className="command-hint">⌘K</span>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="goal-editor-wrap"
          >
            <div className="goal-editor-card">
              <label className="field-label">
                <span className="field-label-text">your goal</span>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  placeholder="What are you working toward?"
                  className="textarea-field"
                />
              </label>
              <div className="form-grid">
                <label className="field-label">
                  <span className="field-label-text">level targeted</span>
                  <input
                    value={levelV}
                    onChange={(e) => setLevelV(e.target.value)}
                    placeholder="e.g. senior, staff"
                    className="text-field"
                  />
                </label>
                <label className="field-label">
                  <span className="field-label-text">skills to demonstrate</span>
                  <input
                    value={skillsV}
                    onChange={(e) => setSkillsV(e.target.value)}
                    placeholder="e.g. systems design, mentorship"
                    className="text-field"
                  />
                </label>
              </div>
              <label className="field-label">
                <span className="field-label-text">growth areas</span>
                <input
                  value={growthV}
                  onChange={(e) => setGrowthV(e.target.value)}
                  placeholder="optional"
                  className="text-field"
                />
              </label>
              {error && (
                <p style={{ margin: 0, color: "var(--color-danger, #c0563a)", fontSize: 12 }}>
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button onClick={cancel} className="button">
                  cancel
                </button>
                <button onClick={save} disabled={pending} className="button button-primary">
                  {pending ? "saving…" : "save"}
                </button>
              </div>
              <p style={{ margin: 0, color: "var(--color-text-faint)", fontSize: 11 }}>
                history of changes is kept — see{" "}
                <Link href="/settings/goal-history" style={{ color: "inherit" }}>
                  settings → goal history
                </Link>
                . goal text is private to you and never appears in any aggregate.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
