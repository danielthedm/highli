import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/company/http";
import { canManageCompany, getCompanyActor } from "@/lib/company/auth";
import { createSurvey, distributeSurvey, listSurveys } from "@/lib/company/surveys";

const createSchema = z.object({
  title: z.string().min(1).max(160),
  audienceType: z.enum(["department", "division", "company"]),
  audienceKey: z.string().min(1),
  schedule: z.string().optional(),
  questions: z
    .array(
      z.object({
        type: z.enum(["likert", "multiple-choice", "free-text"]),
        prompt: z.string().min(1).max(500),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

export async function GET(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    if (!canManageCompany(actor)) {
      return NextResponse.json({ error: "manager role required" }, { status: 403 });
    }
    return NextResponse.json({ surveys: await listSurveys() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    if (!canManageCompany(actor)) {
      return NextResponse.json({ error: "manager role required" }, { status: 403 });
    }
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ ok: true, survey: await createSurvey(actor, parsed.data) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    if (!canManageCompany(actor)) {
      return NextResponse.json({ error: "manager role required" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    if (typeof body.surveyId !== "string") {
      return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, job: await distributeSurvey(body.surveyId) });
  } catch (error) {
    return apiError(error);
  }
}
