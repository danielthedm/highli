import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { getCompanyActor } from "@/lib/company/auth";
import { resolveOrgScope, type ScopeType } from "@/lib/company/floor-cascade";

export async function GET(req: NextRequest, context: { params: Promise<{ scope: string }> }) {
  try {
    const actor = await getCompanyActor(req);
    const { scope } = await context.params;
    const key = req.nextUrl.searchParams.get("scopeKey");
    const type = ["company", "division", "department", "team"].includes(scope)
      ? (scope as ScopeType)
      : "arbitrary";
    return NextResponse.json({ scope: await resolveOrgScope(actor, { type, key }) });
  } catch (error) {
    return apiError(error);
  }
}
