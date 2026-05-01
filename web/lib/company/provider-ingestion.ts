import "server-only";
import { Octokit } from "@octokit/rest";
import { LinearClient } from "@linear/sdk";
import { sql } from "drizzle-orm";
import { getCompanyDb } from "@/lib/company/db";

type Provider = "github" | "linear";

export async function runProviderIngestion(
  provider: Provider,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (provider === "github") return ingestGitHub(payload);
  return ingestLinear(payload);
}

async function ingestGitHub(payload: Record<string, unknown>) {
  const token =
    process.env.GITHUB_APP_INSTALLATION_TOKEN ??
    process.env.GITHUB_SERVICE_TOKEN ??
    process.env.GITHUB_TOKEN;
  const org = String(payload.org ?? process.env.GITHUB_ORG ?? "");
  if (!token || !org) {
    throw new Error("GitHub service ingestion needs GITHUB_APP_INSTALLATION_TOKEN or GITHUB_TOKEN and GITHUB_ORG");
  }

  const octokit = new Octokit({ auth: token });
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await octokit.search.issuesAndPullRequests({
    q: `org:${org} is:pr updated:>=${since.split("T")[0]}`,
    per_page: 50,
    sort: "updated",
    order: "desc",
  });

  let inserted = 0;
  for (const pr of data.items) {
    const handle = pr.user?.login;
    if (!handle) continue;
    const rows = await writeProviderEvent({
      source: "github",
      sourceHandleColumn: "github_handle",
      sourceHandle: handle,
      id: `github:org-pr:${pr.repository_url.split("/").slice(-2).join("/")}#${pr.number}`,
      type: "pr",
      ts: pr.updated_at,
      title: pr.title,
      url: pr.html_url,
      payload: {
        number: pr.number,
        repositoryUrl: pr.repository_url,
        state: pr.state,
        comments: pr.comments,
      },
    });
    inserted += rows;
  }

  return { ok: true, provider: "github", inserted, scanned: data.items.length };
}

async function ingestLinear(_payload: Record<string, unknown>) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("Linear service ingestion needs LINEAR_API_KEY");

  const client = new LinearClient({ apiKey });
  const issues = await client.issues({
    filter: { updatedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
    first: 50,
  });

  let inserted = 0;
  for (const issue of issues.nodes) {
    const assignee = await issue.assignee;
    if (!assignee?.id) continue;
    const rows = await writeProviderEvent({
      source: "linear",
      sourceHandleColumn: "linear_user_id",
      sourceHandle: assignee.id,
      id: `linear:issue:${issue.identifier}`,
      type: "issue",
      ts: issue.updatedAt.toISOString(),
      title: `${issue.identifier}: ${issue.title}`,
      url: issue.url,
      payload: {
        identifier: issue.identifier,
        estimate: issue.estimate ?? null,
        completedAt: issue.completedAt?.toISOString() ?? null,
      },
    });
    inserted += rows;
  }

  return { ok: true, provider: "linear", inserted, scanned: issues.nodes.length };
}

async function writeProviderEvent(input: {
  source: Provider;
  sourceHandleColumn: "github_handle" | "linear_user_id";
  sourceHandle: string;
  id: string;
  type: string;
  ts: string;
  title: string;
  url?: string | null;
  payload: Record<string, unknown>;
}) {
  const result = await getCompanyDb().execute(sql`
    WITH matched_engineer AS (
      SELECT id, department, division, company
      FROM me.engineers
      WHERE ${sql.identifier(input.sourceHandleColumn)} = ${input.sourceHandle}
      LIMIT 1
    ),
    me_insert AS (
      INSERT INTO me.events (
        id, engineer_id, source, source_scope, type, ts, title, url, payload
      )
      SELECT
        ${input.id}, id, ${input.source}, 'public-org', ${input.type},
        ${new Date(input.ts)}, ${input.title}, ${input.url ?? null},
        ${JSON.stringify(input.payload)}::jsonb
      FROM matched_engineer
      ON CONFLICT (id) DO NOTHING
      RETURNING engineer_id
    )
    INSERT INTO org.events (
      id, engineer_id, department, division, company, source, type, ts, title, url, payload
    )
    SELECT
      ${input.id}, m.id, m.department, m.division, m.company, ${input.source},
      ${input.type}, ${new Date(input.ts)}, ${input.title}, ${input.url ?? null},
      ${JSON.stringify(input.payload)}::jsonb
    FROM matched_engineer m
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `);
  return ((result as any).rowCount ?? (result as any).rows?.length ?? 0) as number;
}
