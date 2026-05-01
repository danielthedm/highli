import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/company/http";
import { getCompanyActor } from "@/lib/company/auth";
import {
  confirmAnonymousRedaction,
  enqueueAnonymousRedaction,
  getAnonymousRedactionRequest,
} from "@/lib/company/anon-data";

const bodySchema = z.union([
  z.object({
    text: z.string().min(5).max(5000),
    previewOnly: z.literal(true).optional(),
  }),
  z.object({
    requestId: z.string().uuid(),
    confirm: z.literal(true),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    await getCompanyActor(req);
    const requestId = req.nextUrl.searchParams.get("requestId");
    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }
    const request = await getAnonymousRedactionRequest(requestId);
    if (!request) {
      return NextResponse.json({ error: "redaction request not found" }, { status: 404 });
    }
    return NextResponse.json(request);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if ("requestId" in parsed.data) {
      return NextResponse.json(
        await confirmAnonymousRedaction(actor, parsed.data.requestId),
      );
    }
    return NextResponse.json(await enqueueAnonymousRedaction(actor, parsed.data));
  } catch (error) {
    return apiError(error);
  }
}
