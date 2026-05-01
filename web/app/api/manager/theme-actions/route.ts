import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { apiError } from "@/lib/company/http";
import { canManageCompany, getCompanyActor } from "@/lib/company/auth";
import { getCompanyDb } from "@/lib/company/db";

const bodySchema = z.object({
  themeSource: z.enum(["anon", "metric", "combined"]),
  themeId: z.string().min(1),
  action: z.enum(["acknowledge", "addressing", "not-real-signal"]),
  note: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    if (!canManageCompany(actor)) {
      return NextResponse.json({ error: "manager role required" }, { status: 403 });
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const result = await getCompanyDb().execute(sql`
      INSERT INTO org.manager_theme_actions (
        theme_source, theme_id, manager_engineer_id, action, note
      )
      VALUES (
        ${parsed.data.themeSource}, ${parsed.data.themeId},
        ${actor.engineerId}, ${parsed.data.action}, ${parsed.data.note ?? null}
      )
      RETURNING id
    `);
    return NextResponse.json({ ok: true, action: (result as any).rows?.[0] ?? null });
  } catch (error) {
    return apiError(error);
  }
}
