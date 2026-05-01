import "server-only";
import { createHash, randomBytes } from "crypto";
import { generateObject } from "ai";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getModel } from "@highli/core/ai";
import { anonymousRedactionRequests, anonymousSubmissions } from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import type { CompanyActor } from "@/lib/company/auth";
import { recordAudit } from "@/lib/company/me-data";
import { enqueueJob, type HighliJob } from "@/lib/company/job-queue";
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

const themeSchema = z.object({
  title: z.string().min(1).max(120),
  compositeExcerpt: z.string().min(1).max(500),
});

export type FrustrationCategory = (typeof frustrationCategories)[number];
export type AnonymousClassification = z.infer<typeof redactionSchema> & {
  freshness?: { status: "fresh" | "fallback"; generatedAt: string; error?: string };
};

function hasAiProvider(): boolean {
  return !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;
}

async function classifyAndRedactWithAi(text: string) {
  if (!hasAiProvider()) {
    throw new Error("AI provider is not configured");
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

export async function enqueueAnonymousRedaction(
  actor: CompanyActor,
  input: { text: string },
) {
  const [request] = await getCompanyDb()
    .insert(anonymousRedactionRequests)
    .values({
      inputText: input.text,
      originalFingerprint: digest(input.text),
      previewOnly: true,
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning();

  const job = await enqueueJob({
    type: "anon.redact",
    payload: { requestId: request.id },
    maxAttempts: 3,
    backoffSeconds: 30,
  });

  await getCompanyDb().execute(sql`
    UPDATE anon.redaction_requests
    SET source_job_id = ${job.id}::uuid
    WHERE id = ${request.id}
  `);

  await recordAudit(actor, {
    type: "frustration.redaction_queued",
    summary: "Anonymous redaction request queued without identity columns",
    metadata: { requestId: request.id, jobId: job.id },
  });

  return {
    stored: false,
    requestId: request.id,
    jobId: job.id,
    status: "pending",
    trackingToken: null,
    classification: null,
    freshness: { status: "queued", retryable: true },
  };
}

export async function getAnonymousRedactionRequest(requestId: string) {
  const [request] = rows<any>(
    await getCompanyDb().execute(sql`
      SELECT id, status, classification, source_job_id, error, processed_at
      FROM anon.redaction_requests
      WHERE id = ${requestId}::uuid
      LIMIT 1
    `),
  );

  if (!request) return null;
  return {
    stored: false,
    requestId: request.id,
    jobId: request.source_job_id,
    status: request.status,
    trackingToken: null,
    classification: request.classification ?? null,
    ...routingForClassification(request.classification),
    error: request.error ?? null,
    freshness: {
      status:
        request.status === "succeeded" || request.status === "fallback"
          ? request.status
          : request.status === "failed"
            ? "failed"
            : "pending",
      generatedAt: request.processed_at ?? null,
      retryable: request.status !== "failed",
    },
  };
}

export async function confirmAnonymousRedaction(
  actor: CompanyActor,
  requestId: string,
) {
  const [request] = rows<any>(
    await getCompanyDb().execute(sql`
      SELECT id, status, classification, original_fingerprint, stored_submission_id
      FROM anon.redaction_requests
      WHERE id = ${requestId}::uuid
      LIMIT 1
    `),
  );

  if (!request) throw new Error("redaction request not found");
  if (request.stored_submission_id) {
    return {
      stored: true,
      trackingToken: null,
      classification: request.classification,
      submission: { id: request.stored_submission_id, status: "stored" },
    };
  }
  if (request.status !== "succeeded" && request.status !== "fallback") {
    return {
      stored: false,
      requestId,
      status: request.status,
      freshness: { status: request.status, retryable: true },
    };
  }

  const redacted = redactionSchema.parse(request.classification);
  const trackingToken = `highli_${randomBytes(18).toString("base64url")}`;

  if (redacted.category === "hr-territory") {
    await recordAudit(actor, {
      type: "frustration.hr_redirect",
      summary: "Anonymous submission redirected to HR/ethics process",
      metadata: { category: redacted.category, trackingToken, requestId },
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
        requestId,
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

  const tokenDigest = digest(trackingToken);
  const [submission] = await getCompanyDb()
    .insert(anonymousSubmissions)
    .values({
      category: redacted.category,
      redactedText: redacted.redactedText,
      originalFingerprint: request.original_fingerprint,
      trackingTokenDigest: tokenDigest,
      status: "stored",
    })
    .returning();

  await getCompanyDb().execute(sql`
    UPDATE anon.redaction_requests
    SET stored_submission_id = ${submission.id}::uuid,
        tracking_token_digest = ${tokenDigest},
        status = 'stored'
    WHERE id = ${requestId}::uuid
  `);

  await recordAudit(actor, {
    type: "frustration.submitted",
    summary: "Anonymous frustration submission stored without identity columns",
    metadata: {
      trackingToken,
      category: redacted.category,
      anonymousSubmissionId: submission.id,
      requestId,
    },
  });

  return {
    stored: true,
    trackingToken,
    classification: redacted,
    submission: { id: submission.id, status: submission.status },
  };
}

export async function processAnonymousRedactionRequest(job: HighliJob) {
  const requestId = String(job.payload.requestId ?? "");
  if (!requestId) throw new Error("anon.redact job missing requestId");

  const [request] = rows<{ input_text: string | null }>(
    await getCompanyDb().execute(sql`
      UPDATE anon.redaction_requests
      SET status = 'running',
          error = NULL
      WHERE id = ${requestId}::uuid
      RETURNING input_text
    `),
  );

  if (!request) throw new Error("redaction request not found");
  if (!request.input_text) {
    return { ok: true, requestId, skipped: "already materialized" };
  }

  let classification: AnonymousClassification;
  try {
    classification = {
      ...(await classifyAndRedactWithAi(request.input_text)),
      freshness: { status: "fresh", generatedAt: new Date().toISOString() },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (hasAiProvider() && job.attempts < job.maxAttempts) {
      await getCompanyDb().execute(sql`
        UPDATE anon.redaction_requests
        SET status = 'retrying',
            error = ${message}
        WHERE id = ${requestId}::uuid
      `);
      throw error;
    }
    classification = {
      ...fallbackRedaction(request.input_text),
      freshness: {
        status: "fallback",
        generatedAt: new Date().toISOString(),
        error: message,
      },
    };
  }

  await getCompanyDb().execute(sql`
    UPDATE anon.redaction_requests
    SET input_text = NULL,
        classification = ${JSON.stringify(classification)}::jsonb,
        status = ${classification.freshness?.status === "fallback" ? "fallback" : "succeeded"},
        processed_at = now(),
        error = ${classification.freshness?.error ?? null}
    WHERE id = ${requestId}::uuid
  `);

  return {
    ok: true,
    requestId,
    status: classification.freshness?.status ?? "fresh",
    category: classification.category,
  };
}

export async function getAnonymousThemes(actor: CompanyActor, params: URLSearchParams) {
  const resolution = await resolveOrgScope(actor, scopeRequestFromSearchParams(params));
  if (!resolution.renderable) {
    return { scope: resolution, themes: [], freshness: { status: "blocked" } };
  }

  const themes = rows<any>(
    await getCompanyDb().execute(sql`
      SELECT id, title, composite_excerpt, category, sample_count, new_this_week, generated_at, status
      FROM anon.themes
      WHERE scope_type = ${resolution.scopeType}
        AND scope_key = ${resolution.scopeKey}
        AND sample_count >= 8
        AND status = 'active'
      ORDER BY generated_at DESC
      LIMIT 10
    `),
  );

  const latestGeneratedAt = themes[0]?.generated_at
    ? new Date(themes[0].generated_at)
    : null;
  const stale =
    !latestGeneratedAt ||
    Date.now() - latestGeneratedAt.getTime() > 60 * 60 * 1000;
  let refreshJobId: string | null = null;
  if (stale) {
    const bucket = new Date();
    bucket.setMinutes(0, 0, 0);
    const job = await enqueueJob({
      type: "anon.themes",
      payload: {
        scopeType: resolution.scopeType,
        scopeKey: resolution.scopeKey,
      },
      idempotencyKey: `anon.themes:${resolution.scopeType}:${resolution.scopeKey}:${bucket.toISOString()}`,
    });
    refreshJobId = job.id;
  }

  return {
    scope: resolution,
    themes,
    freshness: {
      status: themes.length === 0 ? "missing" : stale ? "stale" : "fresh",
      generatedAt: latestGeneratedAt?.toISOString() ?? null,
      refreshJobId,
    },
  };
}

export async function generateAnonymousThemes(
  job?: HighliJob,
): Promise<Record<string, unknown>> {
  const groups = rows<{
    scope_key: string;
    category: FrustrationCategory;
    sample_count: number;
    new_this_week: number;
    excerpts: string[];
  }>(
    await getCompanyDb().execute(sql`
      SELECT
        'Highli Demo' AS scope_key,
        category,
        count(*)::int AS sample_count,
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS new_this_week,
        array_agg(redacted_text ORDER BY created_at DESC) FILTER (WHERE redacted_text IS NOT NULL) AS excerpts
      FROM anon.submissions
      WHERE status = 'stored'
        AND category NOT IN ('interpersonal', 'manager-relationship', 'hr-territory')
      GROUP BY category
      HAVING count(*) >= 8
    `),
  );

  let inserted = 0;
  for (const group of groups) {
    const theme = await materializeTheme(group, job);
    await getCompanyDb().execute(sql`
      UPDATE anon.themes
      SET status = 'superseded'
      WHERE scope_type = 'company'
        AND scope_key = ${group.scope_key}
        AND category = ${group.category}
        AND status = 'active'
    `);
    await getCompanyDb().execute(sql`
      INSERT INTO anon.themes (
        scope_type, scope_key, title, composite_excerpt, category, sample_count, new_this_week, status
      )
      VALUES (
        'company',
        ${group.scope_key},
        ${theme.title},
        ${theme.compositeExcerpt},
        ${group.category},
        ${Number(group.sample_count)},
        ${Number(group.new_this_week)},
        'active'
      )
    `);
    inserted += 1;
  }

  return {
    ok: true,
    inserted,
    groups: groups.length,
    materialization: hasAiProvider() ? "ai" : "fallback",
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fallbackRedaction(text: string): AnonymousClassification {
  let redacted = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/https?:\/\/\S+/gi, "[redacted link]")
    .replace(/@[a-z0-9_-]+/gi, "[redacted handle]")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[redacted date]")
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s+\d{4})?\b/gi, "[redacted date]")
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, "[redacted person]");

  if (redacted.trim().length === 0) redacted = "[redacted submission]";

  return {
    category: categorizeFallback(text),
    redactedText: redacted,
    redactions: [],
  };
}

function categorizeFallback(text: string): FrustrationCategory {
  const normalized = text.toLowerCase();
  if (/\b(harass|discriminat|retaliat|unsafe|legal|ethics)\b/.test(normalized)) {
    return "hr-territory";
  }
  if (/\b(manager|skip|director)\b/.test(normalized)) {
    return "manager-relationship";
  }
  if (/\b(alex|sam|jordan|taylor|person)\b/.test(normalized)) {
    return "interpersonal";
  }
  if (/\b(ci|deploy|build|tool|workflow|github|linear|slack)\b/.test(normalized)) {
    return "tooling";
  }
  if (/\b(oncall|meeting|interrupt|overload|too much|capacity)\b/.test(normalized)) {
    return "workload";
  }
  if (/\b(process|approval|review|handoff)\b/.test(normalized)) {
    return "process";
  }
  return "unactionable";
}

async function materializeTheme(
  group: {
    category: FrustrationCategory;
    sample_count: number;
    new_this_week: number;
    excerpts: string[];
  },
  job?: HighliJob,
) {
  if (!hasAiProvider()) return fallbackTheme(group);

  try {
    const result = await generateObject({
      model: getModel(),
      schema: themeSchema,
      temperature: 0,
      system:
        "Write a manager-safe anonymous theme from already-redacted submissions. Do not infer identities, teams, projects, or exact incidents. Keep the excerpt composite and non-identifying.",
      prompt: [
        `Category: ${group.category}`,
        `Sample count: ${group.sample_count}`,
        "Redacted excerpts:",
        ...group.excerpts.slice(0, 12).map((excerpt) => `- ${excerpt}`),
      ].join("\n"),
    });
    return result.object;
  } catch (error) {
    if (job && job.attempts < job.maxAttempts) throw error;
    return fallbackTheme(group);
  }
}

function fallbackTheme(group: { category: FrustrationCategory; sample_count: number }) {
  const label = group.category.replace(/-/g, " ");
  return {
    title: `${capitalize(label)} friction`,
    compositeExcerpt:
      "Multiple submissions pointed at the same systemic friction. Individual details were removed before storage.",
  };
}

function routingForClassification(classification: unknown) {
  if (!classification) return {};
  const parsed = redactionSchema.safeParse(classification);
  if (!parsed.success) return {};
  if (parsed.data.category === "hr-territory") {
    return {
      redirect: process.env.HIGHLI_HR_REDIRECT_URL ?? "https://example.com/hr",
    };
  }
  if (
    parsed.data.category === "interpersonal" ||
    parsed.data.category === "manager-relationship"
  ) {
    return { routes: ["private-note", "rephrase-systemic", "direct-channel"] };
  }
  return {};
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function rows<T>(result: unknown): T[] {
  const maybe = result as { rows?: T[] };
  return maybe.rows ?? ((Array.isArray(result) ? result : []) as T[]);
}
