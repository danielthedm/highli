import "server-only";
import { sql } from "drizzle-orm";
import { getCompanyDb } from "@/lib/company/db";
import type { CompanyActor } from "@/lib/company/auth";

export type ScopeType = "company" | "division" | "department" | "team" | "arbitrary";
export type FloorReason =
  | "ok"
  | "no-department-qualified"
  | "company-too-small"
  | "team-level-not-supported"
  | "arbitrary-group-not-supported";

export interface UnitCount {
  key: string;
  count: number;
  division?: string | null;
}

export interface ScopeCounts {
  company: string;
  total: number;
  departments: UnitCount[];
  divisions: UnitCount[];
}

export interface ScopeRequest {
  type: ScopeType;
  key?: string | null;
}

export interface ScopeResolution {
  renderable: boolean;
  reason: FloorReason;
  scopeType: "company" | "division" | "department";
  scopeKey: string;
  engineerCount: number;
  allowedScopes: Array<{
    type: "company" | "division" | "department";
    key: string;
    count: number;
  }>;
  emptyState: string | null;
}

export const SMALL_COMPANY_COPY =
  "highli's company-level views require a minimum of 12 engineers to preserve meaningful aggregation. At your current size, individual conversations are the right altitude, not a dashboard. Your engineers still get the full personal product; the manager surface will activate when your engineering org grows past 12.";

export const SUB_DEPARTMENT_COPY =
  "highli does not render groups smaller than departments. We believe team-level dashboards create pressure toward individual performance management, exactly the friction we exist to avoid. If you need to understand your team, use your 1:1 conversations and direct observation.";

export function resolveScopeFromCounts(
  counts: ScopeCounts,
  request: ScopeRequest,
): ScopeResolution {
  const qualifiedDepartments = counts.departments.filter((d) => d.count >= 25);
  const qualifiedDivisions = counts.divisions.filter((d) => d.count >= 25);
  const companyScope = { type: "company" as const, key: counts.company, count: counts.total };
  const allowedScopes =
    counts.total >= 12
      ? [
          companyScope,
          ...qualifiedDivisions.map((d) => ({
            type: "division" as const,
            key: d.key,
            count: d.count,
          })),
          ...qualifiedDepartments.map((d) => ({
            type: "department" as const,
            key: d.key,
            count: d.count,
          })),
        ]
      : [];

  if (request.type === "team") {
    return rejected("team-level-not-supported", counts, allowedScopes);
  }
  if (request.type === "arbitrary") {
    return rejected("arbitrary-group-not-supported", counts, allowedScopes);
  }
  if (counts.total < 12) {
    return rejected("company-too-small", counts, allowedScopes);
  }

  const noDepartmentQualified = qualifiedDepartments.length === 0;
  if (noDepartmentQualified) {
    if (request.type === "company" || !request.type) {
      return {
        renderable: true,
        reason: "ok",
        scopeType: "company",
        scopeKey: counts.company,
        engineerCount: counts.total,
        allowedScopes: [companyScope],
        emptyState: null,
      };
    }
    return rejected("no-department-qualified", counts, [companyScope]);
  }

  if (request.type === "company") {
    return {
      renderable: true,
      reason: "ok",
      scopeType: "company",
      scopeKey: counts.company,
      engineerCount: counts.total,
      allowedScopes,
      emptyState: null,
    };
  }

  if (request.type === "division") {
    const key = request.key ?? qualifiedDivisions[0]?.key;
    const division = qualifiedDivisions.find((d) => d.key === key);
    if (!division) return rejected("no-department-qualified", counts, allowedScopes);
    return {
      renderable: true,
      reason: "ok",
      scopeType: "division",
      scopeKey: division.key,
      engineerCount: division.count,
      allowedScopes,
      emptyState: null,
    };
  }

  const key = request.key ?? qualifiedDepartments[0]?.key;
  const department = qualifiedDepartments.find((d) => d.key === key);
  if (!department) return rejected("no-department-qualified", counts, allowedScopes);
  return {
    renderable: true,
    reason: "ok",
    scopeType: "department",
    scopeKey: department.key,
    engineerCount: department.count,
    allowedScopes,
    emptyState: null,
  };
}

export async function loadScopeCounts(company: string): Promise<ScopeCounts> {
  const db = getCompanyDb();
  const [companyRow] = rows<{ company: string; count: number }>(
    await db.execute(sql`
      SELECT company, count(*)::int AS count
      FROM me.engineers
      WHERE active = true AND company = ${company}
      GROUP BY company
    `),
  );

  const departments = rows<{ key: string; count: number; division: string | null }>(
    await db.execute(sql`
      SELECT department AS key, count(*)::int AS count, max(division) AS division
      FROM me.engineers
      WHERE active = true AND company = ${company}
      GROUP BY department
      ORDER BY department
    `),
  );

  const divisions = rows<{ key: string; count: number }>(
    await db.execute(sql`
      SELECT division AS key, count(*)::int AS count
      FROM me.engineers
      WHERE active = true AND company = ${company} AND division IS NOT NULL
      GROUP BY division
      ORDER BY division
    `),
  );

  return {
    company,
    total: Number(companyRow?.count ?? 0),
    departments: departments.map((d) => ({
      key: d.key,
      count: Number(d.count),
      division: d.division,
    })),
    divisions: divisions.map((d) => ({
      key: d.key,
      count: Number(d.count),
    })),
  };
}

export async function resolveOrgScope(
  actor: CompanyActor,
  request: ScopeRequest,
): Promise<ScopeResolution> {
  const counts = await loadScopeCounts(actor.company);
  return resolveScopeFromCounts(counts, request);
}

export function scopeRequestFromSearchParams(params: URLSearchParams): ScopeRequest {
  const raw = params.get("scope") ?? "company";
  const key = params.get("scopeKey") ?? undefined;
  if (raw === "company" || raw === "division" || raw === "department" || raw === "team") {
    return { type: raw, key };
  }
  return { type: "arbitrary", key: raw };
}

function rejected(
  reason: Exclude<FloorReason, "ok">,
  counts: ScopeCounts,
  allowedScopes: ScopeResolution["allowedScopes"],
): ScopeResolution {
  return {
    renderable: false,
    reason,
    scopeType: "company",
    scopeKey: counts.company,
    engineerCount: counts.total,
    allowedScopes,
    emptyState: reason === "company-too-small" ? SMALL_COMPANY_COPY : SUB_DEPARTMENT_COPY,
  };
}

function rows<T>(result: unknown): T[] {
  const maybe = result as { rows?: T[] };
  return maybe.rows ?? ((Array.isArray(result) ? result : []) as T[]);
}
