import { notFound } from "next/navigation";
import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCurrentGoal } from "@/lib/store";
import { readDocument } from "@highli/core/documents";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ kind: string; filename: string }>;
}) {
  const { kind, filename } = await params;
  const document = await readDocument(kind, decodeURIComponent(filename));
  if (!document) notFound();

  const current = getCurrentGoal();

  return (
    <>
      <TopStrip
        goal={current?.text ?? null}
        level={current?.level}
        skills={current?.skills}
        growthAreas={current?.growthAreas}
      />
      <AppShell width="reader">
        <PageHeader
          backHref="/documents"
          backLabel="documents"
          eyebrow={document.kind}
          title={document.title}
          description={
            document.timeframe
              ? `${document.timeframe.from} to ${document.timeframe.to}`
              : document.path
          }
        />

        <article className="document-reader">
          <pre>{document.content}</pre>
        </article>
      </AppShell>
      <CmdKPalette />
    </>
  );
}
