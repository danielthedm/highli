import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/company/http";
import { getCompanyActor } from "@/lib/company/auth";
import { recordAudit } from "@/lib/company/me-data";
import { recordAnonymousSurveyResponse } from "@/lib/company/surveys";

const bodySchema = z.object({
  surveyId: z.string().uuid(),
  questionId: z.string().uuid(),
  answer: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const token = `survey_${randomBytes(16).toString("base64url")}`;
    await recordAnonymousSurveyResponse({
      ...parsed.data,
      tokenDigest: createHash("sha256").update(token).digest("hex"),
    });
    await recordAudit(actor, {
      type: "survey.response",
      summary: "Anonymous survey response submitted",
      metadata: { surveyId: parsed.data.surveyId, trackingToken: token },
    });
    return NextResponse.json({ ok: true, trackingToken: token });
  } catch (error) {
    return apiError(error);
  }
}
