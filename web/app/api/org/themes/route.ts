import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { getCompanyActor } from "@/lib/company/auth";
import { getMetricThemes } from "@/lib/company/org-data";

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    return NextResponse.json(await getMetricThemes(actor, req.nextUrl.searchParams));
  } catch (error) {
    return apiError(error);
  }
}
