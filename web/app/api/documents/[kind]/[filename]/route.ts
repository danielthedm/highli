import { NextResponse } from "next/server";
import { readDocument } from "@highli/core/documents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; filename: string }> },
) {
  const { kind, filename } = await params;
  const document = await readDocument(kind, decodeURIComponent(filename));

  if (!document) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ document });
}
