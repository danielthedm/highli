export default function Custom500() {
  return (
    <main style={shellStyle}>
      <section style={cardStyle}>
        <p style={pillStyle}>Something went wrong</p>
        <h1 style={titleStyle}>highli could not render this page.</h1>
        <p style={copyStyle}>Reload the page or return to the raw timeline.</p>
        <a href="/timeline" style={buttonStyle}>
          Back to raw timeline
        </a>
      </section>
    </main>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  margin: 0,
  padding: "72px 20px",
  background: "#f9efe4",
  color: "#2f2f30",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "min(720px, 100%)",
  margin: "0 auto",
  padding: "clamp(26px, 5vw, 44px)",
  border: "1px solid rgba(47, 47, 48, 0.11)",
  borderRadius: 30,
  background: "#fffaf3",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  margin: 0,
  padding: "7px 13px",
  border: "1px solid rgba(47, 47, 48, 0.13)",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const titleStyle: React.CSSProperties = {
  margin: "20px 0 0",
  fontSize: "clamp(42px, 8vw, 78px)",
  lineHeight: 0.95,
  letterSpacing: "-0.06em",
};

const copyStyle: React.CSSProperties = {
  margin: "22px 0 0",
  color: "#6f6962",
  fontSize: 17,
  lineHeight: 1.6,
};

const buttonStyle: React.CSSProperties = {
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
};
