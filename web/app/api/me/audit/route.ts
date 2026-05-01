import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { assertMeAccess, getCompanyActor } from "@/lib/company/auth";
import { listAudit } from "@/lib/company/me-data";

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    assertMeAccess(actor, req.nextUrl.searchParams.get("engineerId"));
    return NextResponse.json({
      audit: await listAudit(actor),
      namedQueries: [],
      namedQueriesExplanation:
        "No production route in highli queries an engineer by name for a manager-facing surface.",
    });
  } catch (error) {
    return apiError(error);
  }
}
