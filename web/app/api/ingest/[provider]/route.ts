import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { getCompanyActor } from "@/lib/company/auth";
import { enqueueJob } from "@/lib/company/job-queue";

export async function POST(req: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    await getCompanyActor(req);
    const { provider } = await context.params;
    if (provider !== "github" && provider !== "linear") {
      return NextResponse.json({ error: "unsupported provider" }, { status: 400 });
    }
    const payload = await req.json().catch(() => ({}));
    const job = await enqueueJob({
      type: `${provider}.sync`,
      payload,
      idempotencyKey: `${provider}.sync:${JSON.stringify(payload)}`,
    });
    return NextResponse.json({ job });
  } catch (error) {
    return apiError(error);
  }
}
