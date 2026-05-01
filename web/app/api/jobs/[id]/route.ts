import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { getJob } from "@/lib/company/job-queue";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = await getJob(id);
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    return apiError(error);
  }
}
