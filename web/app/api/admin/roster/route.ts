import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { canAdminCompany, getCompanyActor } from "@/lib/company/auth";
import { importRosterCsv } from "@/lib/company/onboarding";

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    if (!canAdminCompany(actor)) {
      return NextResponse.json({ error: "admin role required" }, { status: 403 });
    }
    const csv = await req.text();
    return NextResponse.json(await importRosterCsv(csv));
  } catch (error) {
    return apiError(error);
  }
}
