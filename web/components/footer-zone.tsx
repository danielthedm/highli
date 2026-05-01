import Link from "next/link";

const items = [
  { href: "/timeline", label: "open raw timeline" },
  { href: "/brag", label: "open living brag doc" },
  { href: "/documents", label: "open exported documents" },
  { href: "/inbox", label: "triage your inbox" },
  { href: "/review", label: "ask AI to draft something" },
  { href: "/frustrations", label: "log a frustration" },
  { href: "/transparency", label: "see what your manager sees" },
];

export function FooterZone() {
  return (
    <footer className="home-footer">
      <p className="home-footer-title">Useful when review season stops being theoretical.</p>
      <div className="footer-links">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="footer-link"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
