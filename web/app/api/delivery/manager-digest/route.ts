import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { canManageCompany, getCompanyActor } from "@/lib/company/auth";
import { enqueueJob } from "@/lib/company/job-queue";

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    if (!canManageCompany(actor)) {
      return NextResponse.json({ error: "manager role required" }, { status: 403 });
    }
    const job = await enqueueJob({ type: "delivery.manager-digest", payload: {} });
    return NextResponse.json({ job });
  } catch (error) {
    return apiError(error);
  }
}
