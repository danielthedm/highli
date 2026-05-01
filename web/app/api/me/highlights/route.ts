import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { assertMeAccess, getCompanyActor } from "@/lib/company/auth";
import { getHighlights } from "@/lib/company/me-data";

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    return NextResponse.json(await getHighlights(actor));
  } catch (error) {
    return apiError(error);
  }
}
