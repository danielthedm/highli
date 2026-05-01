import "server-only";
import { sql } from "drizzle-orm";
import { getCompanyDb } from "@/lib/company/db";
import { assertCompanyMode } from "@/lib/company/runtime";

export type JobStatus = "pending" | "running" | "succeeded" | "failed";

export interface HighliJob {
  id: string;
  queue: string;
  type: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  result: Record<string, unknown> | null;
}

function rows<T>(result: unknown): T[] {
  const maybe = result as { rows?: T[] };
  return maybe.rows ?? ((Array.isArray(result) ? result : []) as T[]);
}

export async function enqueueJob(params: {
  type: string;
  payload?: Record<string, unknown>;
  queue?: string;
  runAt?: Date;
  maxAttempts?: number;
  backoffSeconds?: number;
  idempotencyKey?: string;
}): Promise<HighliJob> {
  assertCompanyMode();
  const db = getCompanyDb();
  const payload = params.payload ?? {};
  const queue = params.queue ?? "default";
  const runAt = params.runAt ?? new Date();
  const maxAttempts = params.maxAttempts ?? 3;
  const backoffSeconds = params.backoffSeconds ?? 60;

  const result = params.idempotencyKey
    ? await db.execute(sql`
        INSERT INTO jobs.jobs (
          queue, type, payload, run_at, max_attempts, backoff_seconds, idempotency_key
        )
        VALUES (
          ${queue}, ${params.type}, ${JSON.stringify(payload)}::jsonb, ${runAt},
          ${maxAttempts}, ${backoffSeconds}, ${params.idempotencyKey}
        )
        ON CONFLICT (idempotency_key) DO UPDATE SET
          updated_at = now()
        RETURNING id, queue, type, status, payload, attempts, max_attempts, error, result
      `)
    : await db.execute(sql`
        INSERT INTO jobs.jobs (
          queue, type, payload, run_at, max_attempts, backoff_seconds
        )
        VALUES (
          ${queue}, ${params.type}, ${JSON.stringify(payload)}::jsonb, ${runAt},
          ${maxAttempts}, ${backoffSeconds}
        )
        RETURNING id, queue, type, status, payload, attempts, max_attempts, error, result
      `);

  const [job] = rows<any>(result);
  return mapJob(job);
}

export async function getJob(jobId: string): Promise<HighliJob | null> {
  assertCompanyMode();
  const result = await getCompanyDb().execute(sql`
    SELECT id, queue, type, status, payload, attempts, max_attempts, error, result
    FROM jobs.jobs
    WHERE id = ${jobId}
  `);
  const [job] = rows<any>(result);
  return job ? mapJob(job) : null;
}

export async function claimNextJob(queue = "default"): Promise<HighliJob | null> {
  assertCompanyMode();
  const result = await getCompanyDb().execute(sql`
    WITH candidate AS (
      SELECT id
      FROM jobs.jobs
      WHERE queue = ${queue}
        AND status = 'pending'
        AND run_at <= now()
      ORDER BY run_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs.jobs
    SET status = 'running',
        attempts = attempts + 1,
        leased_until = now() + interval '5 minutes',
        updated_at = now()
    WHERE id = (SELECT id FROM candidate)
    RETURNING id, queue, type, status, payload, attempts, max_attempts, error, result
  `);
  const [job] = rows<any>(result);
  return job ? mapJob(job) : null;
}

export async function completeJob(
  jobId: string,
  result: Record<string, unknown> = {},
): Promise<void> {
  await getCompanyDb().execute(sql`
    UPDATE jobs.jobs
    SET status = 'succeeded',
        leased_until = NULL,
        result = ${JSON.stringify(result)}::jsonb,
        updated_at = now()
    WHERE id = ${jobId}
  `);
}

export async function failJob(job: HighliJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const shouldRetry = job.attempts < job.maxAttempts;
  await getCompanyDb().execute(sql`
    UPDATE jobs.jobs
    SET status = ${shouldRetry ? "pending" : "failed"}::job_status,
        leased_until = NULL,
        error = ${message},
        run_at = CASE
          WHEN ${shouldRetry} THEN now() + (${Math.max(job.attempts, 1)} * interval '60 seconds')
          ELSE run_at
        END,
        updated_at = now()
    WHERE id = ${job.id}
  `);
}

export async function registerDefaultSchedules(): Promise<void> {
  assertCompanyMode();
  const db = getCompanyDb();
  const defaults = [
    {
      id: "github-incremental",
      type: "github.sync",
      schedule: "every 15 minutes",
      payload: { mode: "incremental" },
    },
    {
      id: "linear-incremental",
      type: "linear.sync",
      schedule: "every 15 minutes",
      payload: { mode: "incremental" },
    },
    {
      id: "me-friction-detect",
      type: "friction.detect",
      schedule: "hourly",
      payload: {},
    },
    {
      id: "anon-themes",
      type: "anon.themes",
      schedule: "hourly",
      payload: {},
    },
    {
      id: "manager-digest",
      type: "delivery.manager-digest",
      schedule: "weekly monday 09:00",
      payload: {},
    },
  ];

  for (const item of defaults) {
    await db.execute(sql`
      INSERT INTO jobs.scheduled_jobs (id, type, schedule, payload, next_run_at)
      VALUES (${item.id}, ${item.type}, ${item.schedule}, ${JSON.stringify(item.payload)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET
        type = excluded.type,
        schedule = excluded.schedule,
        payload = excluded.payload,
        enabled = true,
        updated_at = now()
    `);
  }
}

function mapJob(row: any): HighliJob {
  return {
    id: String(row.id),
    queue: String(row.queue),
    type: String(row.type),
    status: row.status as JobStatus,
    payload: row.payload ?? {},
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? row.maxAttempts ?? 3),
    error: row.error ?? null,
    result: row.result ?? null,
  };
}
