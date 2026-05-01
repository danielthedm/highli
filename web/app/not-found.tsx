import Link from "next/link";
import { AppShell, PageHeader } from "@/components/page-header";

export default function NotFound() {
  return (
    <AppShell width="narrow">
      <PageHeader
        eyebrow="Page not found"
        title="This note is not in the workspace."
        description="The page may have moved, or the local web app does not know about it yet."
      />
      <Link href="/timeline" className="page-primary-link">
        Back to raw timeline
      </Link>
    </AppShell>
  );
}
