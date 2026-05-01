import "server-only";
import { createHash, randomBytes } from "crypto";
import { generateObject } from "ai";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getModel } from "@highli/core/ai";
import { anonymousSubmissions } from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import type { CompanyActor } from "@/lib/company/auth";
import { recordAudit } from "@/lib/company/me-data";
import {
  resolveOrgScope,
  scopeRequestFromSearchParams,
} from "@/lib/company/floor-cascade";

export const frustrationCategories = [
  "process",
  "tooling",
  "workload",
  "unactionable",
  "interpersonal",
  "manager-relationship",
  "hr-territory",
] as const;

const redactionSchema = z.object({
  category: z.enum(frustrationCategories),
  redactedText: z.string(),
  redactions: z.array(
    z.object({
      original: z.string(),
      replacement: z.string(),
    }),
  ),
});

export type FrustrationCategory = (typeof frustrationCategories)[number];

function hasAiProvider(): boolean {
  return !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;
}

export async function classifyAndRedact(text: string) {
  if (!hasAiProvider()) {
    throw new Error("AI provider is not configured; anonymous submissions are not stored");
  }

  const result = await generateObject({
    model: getModel(),
    schema: redactionSchema,
    temperature: 0,
    system:
      "Classify the submission and rewrite it to remove names, handles, emails, exact dates, and identifying project/person details. HR-territory means harassment, discrimination, retaliation, legal risk, or safety issues. Return only the schema.",
    prompt: text,
  });

  return result.object;
}

export async function submitAnonymousFrustration(
  actor: CompanyActor,
  input: { text: string; previewOnly?: boolean },
) {
  const redacted = await classifyAndRedact(input.text);
  const trackingToken = `highli_${randomBytes(18).toString("base64url")}`;

  if (redacted.category === "hr-territory") {
    await recordAudit(actor, {
      type: "frustration.hr_redirect",
      summary: "Anonymous submission redirected to HR/ethics process",
      metadata: { category: redacted.category, trackingToken },
    });
    return {
      stored: false,
      trackingToken,
      classification: redacted,
      redirect: process.env.HIGHLI_HR_REDIRECT_URL ?? "https://example.com/hr",
    };
  }

  if (
    redacted.category === "interpersonal" ||
    redacted.category === "manager-relationship"
  ) {
    await recordAudit(actor, {
      type: "frustration.private_not_aggregated",
      summary: "Submission kept out of anonymous aggregates because it named a relationship",
      metadata: {
        category: redacted.category,
        trackingToken,
        suggestedRoutes: ["private-note", "rephrase-systemic", "direct-channel"],
      },
    });
    return {
      stored: false,
      trackingToken,
      classification: redacted,
      routes: ["private-note", "rephrase-systemic", "direct-channel"],
    };
  }

  if (input.previewOnly) {
    return { stored: false, trackingToken: null, classification: redacted };
  }

  const tokenDigest = digest(trackingToken);
  const [submission] = await getCompanyDb()
    .insert(anonymousSubmissions)
    .values({
      category: redacted.category,
      redactedText: redacted.redactedText,
      originalFingerprint: digest(input.text),
      trackingTokenDigest: tokenDigest,
      status: "stored",
    })
    .returning();

  await recordAudit(actor, {
    type: "frustration.submitted",
    summary: "Anonymous frustration submission stored without identity columns",
    metadata: {
      trackingToken,
      category: redacted.category,
      anonymousSubmissionId: submission.id,
    },
  });

  return {
    stored: true,
    trackingToken,
    classification: redacted,
    submission: { id: submission.id, status: submission.status },
  };
}

export async function getAnonymousThemes(actor: CompanyActor, params: URLSearchParams) {
  const resolution = await resolveOrgScope(actor, scopeRequestFromSearchParams(params));
  if (!resolution.renderable) return { scope: resolution, themes: [] };

  const themes = rows<any>(
    await getCompanyDb().execute(sql`
      SELECT id, title, composite_excerpt, category, sample_count, new_this_week, generated_at
      FROM anon.themes
      WHERE scope_type = ${resolution.scopeType}
        AND scope_key = ${resolution.scopeKey}
        AND sample_count >= 8
        AND status = 'active'
      ORDER BY generated_at DESC
      LIMIT 10
    `),
  );
  return { scope: resolution, themes };
}

export async function generateAnonymousThemes(): Promise<Record<string, unknown>> {
  const inserted = rows<{ id: string }>(
    await getCompanyDb().execute(sql`
      INSERT INTO anon.themes (
        scope_type, scope_key, title, composite_excerpt, category, sample_count, new_this_week
      )
      SELECT
        'company',
        'Highli Demo',
        initcap(category) || ' friction',
        'Multiple submissions pointed at the same systemic friction. Individual details were removed before storage.',
        category,
        count(*)::int,
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int
      FROM anon.submissions
      WHERE status = 'stored'
        AND category NOT IN ('interpersonal', 'manager-relationship', 'hr-territory')
      GROUP BY category
      HAVING count(*) >= 8
      RETURNING id
    `),
  );
  return { ok: true, inserted: inserted.length };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rows<T>(result: unknown): T[] {
  const maybe = result as { rows?: T[] };
  return maybe.rows ?? ((Array.isArray(result) ? result : []) as T[]);
}
