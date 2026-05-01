import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/company/http";
import { assertMeAccess, getCompanyActor } from "@/lib/company/auth";
import { getGoal, listGoalHistory, setGoal } from "@/lib/company/me-data";

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
  level: z.string().max(200).optional(),
  skills: z.string().max(500).optional(),
  growthAreas: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    return NextResponse.json({
      current: await getGoal(actor),
      history: await listGoalHistory(actor),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ ok: true, goal: await setGoal(actor, parsed.data) });
  } catch (error) {
    return apiError(error);
  }
}
