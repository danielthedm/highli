import Link from "next/link";
import { CmdKPalette } from "@/components/cmdk-palette";

export const metadata = {
  title: "highli — log a frustration",
};

export default function FrustrationsPage() {
  return (
    <div className="anon-register" style={{ minHeight: "100vh" }}>
      <header
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--color-anon-border)",
        }}
      >
        <Link
          href="/"
          style={{
            color: "var(--color-text-faint)",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← back
        </Link>
      </header>

      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "64px 24px",
        }}
      >
        <p
          className="font-narrative"
          style={{
            fontSize: 14,
            color: "var(--color-text-dim)",
            margin: "0 0 24px",
            fontStyle: "italic",
          }}
        >
          you are on the anonymous side of the wall.
        </p>
        <h1
          className="font-narrative"
          style={{
            fontSize: 26,
            fontWeight: 500,
            margin: "0 0 16px",
            color: "var(--color-text)",
          }}
        >
          What is bothering you?
        </h1>
        <p
          style={{
            color: "var(--color-text-dim)",
            fontSize: 14,
            lineHeight: 1.55,
            margin: "0 0 28px",
          }}
        >
          The full submission flow — AI classification, redaction preview, and
          tracking-token return — comes online in build #13. This is the
          register: cooler, deeper, no avatar, no name, no career goal.
        </p>
        <textarea
          disabled
          placeholder="Submission disabled until build #13."
          style={{
            width: "100%",
            minHeight: 160,
            background: "var(--color-anon-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-anon-border)",
            borderRadius: 6,
            padding: 16,
            fontFamily: "var(--font-narrative)",
            fontSize: 15,
            lineHeight: 1.55,
            outline: "none",
            resize: "vertical",
          }}
        />
      </main>
      <CmdKPalette />
    </div>
  );
}
