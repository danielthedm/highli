import { NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { enqueueJob } from "@/lib/company/job-queue";

export async function POST() {
  try {
    const job = await enqueueJob({ type: "noop", payload: { createdBy: "api" } });
    return NextResponse.json({ job });
  } catch (error) {
    return apiError(error);
  }
}
