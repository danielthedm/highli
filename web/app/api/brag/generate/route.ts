import { NextResponse } from "next/server";
import { generateLivingBragDoc } from "@/lib/brag-doc-generator";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await generateLivingBragDoc();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to generate brag doc";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
