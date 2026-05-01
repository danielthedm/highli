import "server-only";
import { sql } from "drizzle-orm";
import { orgSurveyQuestions, orgSurveys } from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import { enqueueJob } from "@/lib/company/job-queue";
import type { CompanyActor } from "@/lib/company/auth";

export async function createSurvey(
  actor: CompanyActor,
  input: {
    title: string;
    audienceType: "department" | "division" | "company";
    audienceKey: string;
    questions: Array<{ type: string; prompt: string; options?: string[] }>;
    schedule?: string;
  },
) {
  const [survey] = await getCompanyDb()
    .insert(orgSurveys)
    .values({
      title: input.title,
      audienceType: input.audienceType,
      audienceKey: input.audienceKey,
      schedule: input.schedule ?? "once",
      createdByEngineerId: actor.engineerId,
      status: "draft",
    })
    .returning();

  for (const [position, question] of input.questions.entries()) {
    await getCompanyDb().insert(orgSurveyQuestions).values({
      surveyId: survey.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options ?? null,
      position,
    });
  }

  return survey;
}

export async function listSurveys() {
  const result = await getCompanyDb().execute(sql`
    SELECT s.*,
      coalesce(json_agg(q.* ORDER BY q.position) FILTER (WHERE q.id IS NOT NULL), '[]') AS questions
    FROM org.surveys s
    LEFT JOIN org.survey_questions q ON q.survey_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);
  return (result as any).rows ?? [];
}

export async function distributeSurvey(surveyId: string) {
  await getCompanyDb().execute(sql`
    UPDATE org.surveys
    SET status = 'distributed', updated_at = now()
    WHERE id = ${surveyId}
  `);
  return enqueueJob({
    type: "survey.distribute",
    payload: { surveyId },
    idempotencyKey: `survey.distribute:${surveyId}`,
  });
}

export async function recordAnonymousSurveyResponse(input: {
  surveyId: string;
  questionId: string;
  answer: Record<string, unknown>;
  tokenDigest: string;
}) {
  await getCompanyDb().execute(sql`
    INSERT INTO anon.survey_responses (survey_id, question_id, answer, tracking_token_digest)
    VALUES (
      ${input.surveyId}::uuid,
      ${input.questionId}::uuid,
      ${JSON.stringify(input.answer)}::jsonb,
      ${input.tokenDigest}
    )
  `);
}
