import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addToManualGroup,
  createManualGroup,
  deleteManualGroup,
  listManualGroups,
} from "@/lib/store";

const createSchema = z.object({
  framing: z.string().min(1).max(280),
  eventIds: z.array(z.string()).min(2),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const groupId = createManualGroup(parsed.data.framing, parsed.data.eventIds);
  return NextResponse.json({ ok: true, groupId });
}

export async function GET() {
  return NextResponse.json({ groups: listManualGroups() });
}

const mergeSchema = z.object({
  groupId: z.number().int().positive(),
  eventId: z.string(),
});

export async function PATCH(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = mergeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  addToManualGroup(parsed.data.groupId, parsed.data.eventId);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ groupId: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  deleteManualGroup(parsed.data.groupId);
  return NextResponse.json({ ok: true });
}
