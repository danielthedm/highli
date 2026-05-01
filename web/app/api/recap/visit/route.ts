import { NextResponse } from "next/server";
import { recordRecapVisitAt } from "@/lib/recap-visit";

export async function POST() {
  recordRecapVisitAt();
  return NextResponse.json({ ok: true });
}
