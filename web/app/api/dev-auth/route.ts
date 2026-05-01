import { NextRequest, NextResponse } from "next/server";
import { isDevAuthEnabled } from "@/lib/company/runtime";

export async function POST(req: NextRequest) {
  if (!isDevAuthEnabled()) {
    return NextResponse.json({ error: "dev auth is disabled" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role : "engineer";
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set("highli_dev_actor", role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
