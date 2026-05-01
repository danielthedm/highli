"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { primaryNavItems } from "@/lib/navigation";

interface PaletteEntry {
  id: string;
  label: string;
  group: "navigate" | "actions";
  hint?: string;
  href?: string;
  onSelect?: () => void;
}

export function CmdKPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const entries: PaletteEntry[] = [
    { id: "go-home", label: "Home", group: "navigate", href: "/", hint: "landing page" },
    ...primaryNavItems.map((item) => ({
      id: `go-${item.href.slice(1)}`,
      label: item.paletteLabel,
      group: "navigate" as const,
      href: item.href,
      hint: item.hint,
    })),
    { id: "go-frustrations", label: "Log a frustration", group: "navigate", href: "/frustrations", hint: "anonymous" },
    { id: "go-transparency", label: "See what your manager sees", group: "navigate", href: "/transparency" },
    { id: "go-settings", label: "Settings", group: "navigate", href: "/settings" },
  ];

  function handleSelect(entry: PaletteEntry) {
    setOpen(false);
    if (entry.href) router.push(entry.href);
    entry.onSelect?.();
  }

  if (!open) return null;

  const groups = {
    navigate: entries.filter((e) => e.group === "navigate"),
    actions: entries.filter((e) => e.group === "actions"),
  };

  return (
    <>
      <div className="cmdk-overlay" onClick={() => setOpen(false)} />
      <Command className="cmdk-shell" label="Command palette">
        <Command.Input placeholder="Where to?" className="cmdk-input" />
        <Command.List className="cmdk-list">
          <Command.Empty className="cmdk-empty">
            No matches. Cmd-K closes this.
          </Command.Empty>

          {groups.navigate.length > 0 && (
            <Command.Group heading="Navigate">
              {groups.navigate.map((entry) => (
                <Command.Item
                  key={entry.id}
                  className="cmdk-item"
                  onSelect={() => handleSelect(entry)}
                  value={`${entry.label} ${entry.hint ?? ""}`}
                >
                  <span style={{ color: "var(--color-accent)" }}>→</span>
                  <span style={{ flex: 1 }}>{entry.label}</span>
                  {entry.hint && (
                    <span style={{ color: "var(--color-text-faint)", fontSize: 12 }}>
                      {entry.hint}
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </>
  );
}
