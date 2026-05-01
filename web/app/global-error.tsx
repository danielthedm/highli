"use client";

export default function GlobalError() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f9efe4",
          color: "#2f2f30",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main
          style={{
            width: "min(720px, calc(100vw - 40px))",
            margin: "0 auto",
            padding: "72px 0",
          }}
        >
          <p
            style={{
              display: "inline-flex",
              margin: 0,
              padding: "7px 13px",
              border: "1px solid rgba(47, 47, 48, 0.13)",
              borderRadius: 999,
              background: "#fffaf3",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              margin: "20px 0 0",
              fontSize: "clamp(42px, 8vw, 78px)",
              lineHeight: 0.95,
              letterSpacing: "-0.06em",
            }}
          >
            highli could not render this page.
          </h1>
          <p
            style={{
              margin: "22px 0 0",
              color: "#6f6962",
              fontSize: 17,
              lineHeight: 1.6,
            }}
          >
            Reload the page or return to the raw timeline.
          </p>
          <a
            href="/timeline"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 46,
              marginTop: 28,
              padding: "0 20px",
              borderRadius: 999,
              background: "#2f2f30",
              color: "#f9efe4",
              fontSize: 14,
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Back to raw timeline
          </a>
        </main>
      </body>
    </html>
  );
}
