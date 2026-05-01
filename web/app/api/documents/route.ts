import { NextRequest, NextResponse } from "next/server";
import {
  documentKinds,
  listDocuments,
  saveDocument,
  type DocumentKind,
  type DocumentTimeframe,
} from "@highli/core/documents";

const documentKindSet = new Set<string>(documentKinds);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && documentKindSet.has(value);
}

function parseTimeframe(value: unknown): DocumentTimeframe | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  if (typeof value.from !== "string" || typeof value.to !== "string") {
    return undefined;
  }
  return { from: value.from, to: value.to };
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  let documentKind: DocumentKind | undefined;
  if (kind) {
    if (!isDocumentKind(kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    documentKind = kind;
  }

  const documents = await listDocuments(documentKind);
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  if (!isRecord(json)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!isDocumentKind(json.kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  if (typeof json.content !== "string" || json.content.trim().length === 0) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  if (json.title !== undefined && (typeof json.title !== "string" || json.title.length > 120)) {
    return NextResponse.json({ error: "invalid title" }, { status: 400 });
  }

  const timeframe = parseTimeframe(json.timeframe);
  if (json.timeframe !== undefined && !timeframe) {
    return NextResponse.json({ error: "invalid timeframe" }, { status: 400 });
  }

  const document = await saveDocument({
    kind: json.kind,
    title: json.title,
    content: json.content,
    timeframe,
    source: "web",
  });
  return NextResponse.json({ ok: true, document });
}
