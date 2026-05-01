import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { assertMeAccess, getCompanyActor } from "@/lib/company/auth";
import { listExpansiveEvents } from "@/lib/company/me-data";

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    const events = await listExpansiveEvents(actor);
    return NextResponse.json({
      engineerId: actor.engineerId,
      events,
      freshness: { status: "live-query" },
    });
  } catch (error) {
    return apiError(error);
  }
}
