import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveGoal, getCurrentGoal, listGoalHistory } from "@/lib/store";

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
  level: z.string().max(200).optional(),
  skills: z.string().max(500).optional(),
  growthAreas: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const goal = saveGoal(parsed.data);
  return NextResponse.json({ ok: true, goal });
}

export async function GET() {
  const current = getCurrentGoal();
  return NextResponse.json({
    current,
    history: listGoalHistory(),
  });
}
