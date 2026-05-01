import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { star, unstar } from "@/lib/store";

const bodySchema = z.object({ eventId: z.string() });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  star(parsed.data.eventId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  unstar(parsed.data.eventId);
  return NextResponse.json({ ok: true });
}
