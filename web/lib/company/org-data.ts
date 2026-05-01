import "server-only";
import { sql } from "drizzle-orm";
import { getCompanyDb } from "@/lib/company/db";
import {
  resolveOrgScope,
  scopeRequestFromSearchParams,
  type ScopeResolution,
} from "@/lib/company/floor-cascade";
import type { CompanyActor } from "@/lib/company/auth";

function rows<T>(result: unknown): T[] {
  const maybe = result as { rows?: T[] };
  return maybe.rows ?? ((Array.isArray(result) ? result : []) as T[]);
}

export async function getDigestForRequest(actor: CompanyActor, params: URLSearchParams) {
  const resolution = await resolveOrgScope(actor, scopeRequestFromSearchParams(params));
  if (!resolution.renderable) {
    return { scope: resolution, digest: null };
  }

  const where = scopeWhere(resolution);
  const db = getCompanyDb();

  const workMix = rows<{ work_type: string; count: number }>(
    await db.execute(sql`
      SELECT work_type, count(*)::int AS count
      FROM org.events
      WHERE ${where} AND ts >= now() - interval '7 days'
      GROUP BY work_type
      ORDER BY count DESC
    `),
  );

  const initiatives = rows<{ initiative: string; count: number }>(
    await db.execute(sql`
      SELECT coalesce(initiative, 'unclassified') AS initiative, count(*)::int AS count
      FROM org.events
      WHERE ${where} AND ts >= now() - interval '7 days'
      GROUP BY coalesce(initiative, 'unclassified')
      ORDER BY count DESC
      LIMIT 8
    `),
  );

  const dora = rows<{
    deploys: number;
    mean_cycle_time_hours: number | null;
    change_failures: number;
  }>(
    await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE type = 'deploy')::int AS deploys,
        avg(cycle_time_hours)::int AS mean_cycle_time_hours,
        count(*) FILTER (WHERE deployment_status = 'failed')::int AS change_failures
      FROM org.events
      WHERE ${where} AND ts >= now() - interval '7 days'
    `),
  )[0] ?? { deploys: 0, mean_cycle_time_hours: null, change_failures: 0 };

  const ai = rows<{ total: number; assisted: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ai_assisted = true)::int AS assisted
      FROM org.events
      WHERE ${where} AND ts >= now() - interval '7 days'
    `),
  )[0] ?? { total: 0, assisted: 0 };

  return {
    scope: resolution,
    digest: {
      alpha: workMix.map((row) => ({ label: row.work_type, count: Number(row.count) })),
      beta: initiatives.map((row) => ({ initiative: row.initiative, count: Number(row.count) })),
      delta: {
        deploys: Number(dora.deploys),
        meanCycleTimeHours:
          dora.mean_cycle_time_hours == null ? null : Number(dora.mean_cycle_time_hours),
        changeFailures: Number(dora.change_failures),
      },
      zeta: {
        total: Number(ai.total),
        assisted: Number(ai.assisted),
        percent: Number(ai.total) > 0 ? Math.round((Number(ai.assisted) / Number(ai.total)) * 100) : 0,
      },
      freshness: {
        generatedAt: new Date().toISOString(),
        status: "live-query",
      },
    },
  };
}

export async function getMetricThemes(actor: CompanyActor, params: URLSearchParams) {
  const resolution = await resolveOrgScope(actor, scopeRequestFromSearchParams(params));
  if (!resolution.renderable) return { scope: resolution, themes: [] };

  const themes = rows<any>(
    await getCompanyDb().execute(sql`
      SELECT id, title, metric, hypothesis, sample_size, metadata, generated_at
      FROM org.metric_themes
      WHERE scope_type = ${resolution.scopeType}
        AND scope_key = ${resolution.scopeKey}
        AND status = 'active'
      ORDER BY generated_at DESC
      LIMIT 10
    `),
  );
  return { scope: resolution, themes };
}

export async function generateMetricThemes(): Promise<Record<string, unknown>> {
  const db = getCompanyDb();
  const inserted = rows<{ id: string }>(
    await db.execute(sql`
      INSERT INTO org.metric_themes (
        scope_type, scope_key, title, metric, hypothesis, sample_size, metadata
      )
      SELECT
        'company',
        company,
        'Review wait may need attention',
        'cycle_time',
        'Possible: reviewers stretched, larger PRs, or release pressure?',
        count(*)::int,
        jsonb_build_object('source', 'scheduled-materialization')
      FROM org.events
      WHERE ts >= now() - interval '14 days'
      GROUP BY company
      HAVING count(*) >= 30
      RETURNING id
    `),
  );
  return { ok: true, inserted: inserted.length };
}

function scopeWhere(scope: ScopeResolution) {
  if (scope.scopeType === "company") return sql`company = ${scope.scopeKey}`;
  if (scope.scopeType === "division") return sql`division = ${scope.scopeKey}`;
  return sql`department = ${scope.scopeKey}`;
}
