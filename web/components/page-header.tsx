import Link from "next/link";
import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  width?: "default" | "narrow" | "reader" | "wide";
}

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  backHref?: string;
  backLabel?: string;
  meta?: ReactNode;
}

export function AppShell({ children, width = "default" }: AppShellProps) {
  return <main className={`app-shell app-shell-${width}`}>{children}</main>;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  backHref,
  backLabel = "back",
  meta,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {backHref && (
        <Link href={backHref} className="page-back-link">
          ← {backLabel}
        </Link>
      )}
      <div className="page-header-row">
        <div>
          {eyebrow && <p className="page-kicker">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {meta && <div className="page-meta">{meta}</div>}
      </div>
    </header>
  );
}
