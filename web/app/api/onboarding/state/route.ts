import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/company/http";
import { canAdminCompany, getCompanyActor } from "@/lib/company/auth";
import { advanceInstallState, getInstallState } from "@/lib/company/onboarding";

const bodySchema = z.object({
  next: z.enum(["setup", "communication", "preview", "live", "warmup", "active"]),
});

export async function GET(req: NextRequest) {
  try {
    await getCompanyActor(req);
    return NextResponse.json({ install: await getInstallState() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    if (!canAdminCompany(actor)) {
      return NextResponse.json({ error: "admin role required" }, { status: 403 });
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ install: await advanceInstallState(parsed.data.next) });
  } catch (error) {
    return apiError(error);
  }
}
