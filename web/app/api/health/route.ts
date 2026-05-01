import { NextResponse } from "next/server";
import { pingCompanyDb } from "@/lib/company/db";
import { getRuntimeMode, isCompanyMode } from "@/lib/company/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = getRuntimeMode();
  const database = isCompanyMode() ? await pingCompanyDb() : { ok: true, skipped: "solo" };
  return NextResponse.json({
    ok: database.ok,
    app: "highli-core",
    mode,
    database,
    time: new Date().toISOString(),
  });
}
