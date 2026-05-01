import { NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { runOneJob } from "@/lib/company/worker";

export async function POST() {
  try {
    return NextResponse.json(await runOneJob());
  } catch (error) {
    return apiError(error);
  }
}
