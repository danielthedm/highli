import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { assertMeAccess, getCompanyActor } from "@/lib/company/auth";
import { getFlowFocus } from "@/lib/company/personal-oauth";

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    return NextResponse.json(await getFlowFocus(actor));
  } catch (error) {
    return apiError(error);
  }
}
