import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveDocument } from "@highli/core/documents";

const bodySchema = z.object({
  content: z.string().min(1),
  // Optional title prefix for the filename.
  title: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const document = await saveDocument({
    kind: "review",
    title: parsed.data.title ?? "Review draft",
    content: parsed.data.content,
    source: "web",
  });
  return NextResponse.json({ ok: true, path: document.path, document });
}
