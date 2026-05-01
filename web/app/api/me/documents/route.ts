import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/company/http";
import { assertMeAccess, getCompanyActor } from "@/lib/company/auth";
import { listDocuments, saveDocument } from "@/lib/company/me-data";

const bodySchema = z.object({
  kind: z.string().min(1),
  title: z.string().min(1).max(160),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    const kind = req.nextUrl.searchParams.get("kind");
    return NextResponse.json({ documents: await listDocuments(actor, kind) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ ok: true, document: await saveDocument(actor, parsed.data) });
  } catch (error) {
    return apiError(error);
  }
}
