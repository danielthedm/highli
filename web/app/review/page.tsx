import Link from "next/link";
import { CmdKPalette } from "@/components/cmdk-palette";
import { ReviewChat } from "@/components/review-chat";

export const metadata = {
  title: "highli — review writer",
};

export default function ReviewPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Link
          href="/timeline"
          style={{
            color: "var(--color-text-faint)",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← back to raw timeline
        </Link>
        <span
          style={{
            color: "var(--color-text-faint)",
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
          }}
        >
          review
        </span>
      </header>
      <ReviewChat />
      <CmdKPalette />
    </div>
  );
}
