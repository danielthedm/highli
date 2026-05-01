import Link from "next/link";
import { TopStrip } from "@/components/top-strip";
import { CmdKPalette } from "@/components/cmdk-palette";
import { AppShell, PageHeader } from "@/components/page-header";
import { getCurrentGoal } from "@/lib/store";
import {
  listDocuments,
  type DocumentKind,
  type SavedDocument,
} from "@highli/core/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "highli — documents" };

const groups: Array<{ kind: DocumentKind; title: string; empty: string }> = [
  { kind: "review", title: "Review drafts", empty: "No review drafts saved yet." },
  { kind: "report", title: "Reports", empty: "No reports saved yet." },
  {
    kind: "peer-collab",
    title: "Peer collaboration logs",
    empty: "No peer collaboration logs saved yet.",
  },
];

export default async function DocumentsPage() {
  const current = getCurrentGoal();
  const documents = (await listDocuments()).filter((doc) => doc.kind !== "brag");
  const documentCountLabel = `${documents.length} saved ${
    documents.length === 1 ? "document" : "documents"
  }`;

  return (
    <>
      <TopStrip
        goal={current?.text ?? null}
        level={current?.level}
        skills={current?.skills}
        growthAreas={current?.growthAreas}
      />
      <AppShell>
        <PageHeader
          eyebrow="Documents"
          title="Exported documents"
          description={
            <>
              Review drafts, reports, and peer collaboration logs saved from
              the terminal and web app. The brag doc is now a single living
              view generated from the raw timeline.
            </>
          }
          meta={documentCountLabel}
        />

        <div className="document-sections">
          <section className="section-block">
            <div className="section-heading" style={{ marginBottom: 14 }}>
              <div>
                <p className="section-kicker">Living document</p>
                <h2 className="section-title" style={{ fontSize: "clamp(24px, 3vw, 34px)" }}>
                  Brag doc
                </h2>
              </div>
              <Link href="/brag" className="page-primary-link">
                Open brag doc
              </Link>
            </div>
            <p className="quiet-empty">
              One evolving, AI-grouped document built from timeline evidence.
            </p>
          </section>

          {groups.map((group) => (
            <DocumentSection
              key={group.kind}
              title={group.title}
              empty={group.empty}
              documents={documents.filter((doc) => doc.kind === group.kind)}
            />
          ))}
        </div>
      </AppShell>
      <CmdKPalette />
    </>
  );
}

function DocumentSection({
  title,
  empty,
  documents,
}: {
  title: string;
  empty: string;
  documents: SavedDocument[];
}) {
  return (
    <section className="section-block">
      <div className="section-heading" style={{ marginBottom: 14 }}>
        <div>
          <p className="section-kicker">Documents</p>
          <h2 className="section-title" style={{ fontSize: "clamp(24px, 3vw, 34px)" }}>
            {title}
          </h2>
        </div>
        <p className="section-note">{documents.length} saved</p>
      </div>

      {documents.length === 0 ? (
        <p className="quiet-empty">{empty}</p>
      ) : (
        <ul className="timeline-list">
          {documents.map((doc) => (
            <li key={`${doc.kind}-${doc.filename}`} className="timeline-entry">
              <div className="timeline-meta">
                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                <span className="timeline-type">{doc.source ?? "file"}</span>
              </div>
              <div>
                <p className="timeline-title">
                  <Link
                    href={`/documents/${doc.kind}/${encodeURIComponent(doc.filename)}`}
                  >
                    {doc.title}
                  </Link>
                </p>
                <p className="timeline-summary">
                  {doc.timeframe
                    ? `${doc.timeframe.from} to ${doc.timeframe.to}`
                    : doc.path}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
