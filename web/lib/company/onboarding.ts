import "server-only";
import { eq, sql } from "drizzle-orm";
import { onboardingInstallState } from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import { enqueueJob } from "@/lib/company/job-queue";

export type InstallState = "setup" | "communication" | "preview" | "live" | "warmup" | "active";

const allowedTransitions: Record<InstallState, InstallState[]> = {
  setup: ["communication"],
  communication: ["preview"],
  preview: ["live"],
  live: ["warmup"],
  warmup: ["active"],
  active: [],
};

export async function getInstallState() {
  const db = getCompanyDb();
  const [row] = await db.select().from(onboardingInstallState).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(onboardingInstallState)
    .values({ id: "company", state: "setup" })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.select().from(onboardingInstallState).limit(1))[0];
}

export async function advanceInstallState(next: InstallState) {
  const current = await getInstallState();
  const currentState = current.state as InstallState;
  if (!allowedTransitions[currentState].includes(next)) {
    throw new Error(`cannot transition onboarding from ${currentState} to ${next}`);
  }

  const patch: Partial<typeof onboardingInstallState.$inferInsert> = {
    state: next,
    updatedAt: new Date(),
  };
  if (next === "communication") {
    patch.communicationMarkdown = buildCommunicationTemplate();
  }
  if (next === "preview") patch.previewStartedAt = new Date();
  if (next === "live") patch.liveStartedAt = new Date();
  if (next === "warmup") patch.warmupStartedAt = new Date();
  if (next === "active") patch.activeStartedAt = new Date();

  const [updated] = await getCompanyDb()
    .update(onboardingInstallState)
    .set(patch)
    .where(eq(onboardingInstallState.id, "company"))
    .returning();

  if (next === "live") {
    await enqueueJob({ type: "github.sync", payload: { mode: "backfill" } });
    await enqueueJob({ type: "linear.sync", payload: { mode: "backfill" } });
    await enqueueJob({ type: "delivery.transparency-change", payload: { summary: "highli ingestion started. Personal surfaces are live first." } });
  }
  if (next === "active") {
    await enqueueJob({ type: "anon.themes", payload: {} });
    await enqueueJob({ type: "org.metric-themes", payload: {} });
    await enqueueJob({ type: "delivery.manager-digest", payload: {} });
  }

  return updated;
}

export async function managerSurfacesActive() {
  const state = await getInstallState();
  return state.state === "active";
}

export async function importRosterCsv(csv: string) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  const [headerLine, ...body] = lines;
  if (!headerLine) throw new Error("CSV roster is empty");
  const headers = splitCsvLine(headerLine).map((h) => h.trim());
  const required = ["id", "email", "role", "department", "company"];
  for (const key of required) {
    if (!headers.includes(key)) throw new Error(`CSV roster missing ${key}`);
  }

  let imported = 0;
  for (const line of body) {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""]));
    await getCompanyDb().execute(sql`
      INSERT INTO me.engineers (
        id, email, role, department, division, company, manager_engineer_id,
        github_handle, linear_user_id, slack_user_id, calendar_email, external_id, active
      )
      VALUES (
        ${row.id}, ${row.email}, ${row.role}::engineer_role, ${row.department},
        ${row.division || null}, ${row.company}, ${row.manager_engineer_id || null},
        ${row.github_handle || null}, ${row.linear_user_id || null},
        ${row.slack_user_id || null}, ${row.calendar_email || row.email},
        ${row.external_id || null}, true
      )
      ON CONFLICT (id) DO UPDATE SET
        email = excluded.email,
        role = excluded.role,
        department = excluded.department,
        division = excluded.division,
        company = excluded.company,
        manager_engineer_id = excluded.manager_engineer_id,
        github_handle = excluded.github_handle,
        linear_user_id = excluded.linear_user_id,
        slack_user_id = excluded.slack_user_id,
        calendar_email = excluded.calendar_email,
        external_id = excluded.external_id,
        active = true,
        updated_at = now()
    `);
    imported += 1;
  }

  return { ok: true, imported };
}

function buildCommunicationTemplate() {
  return [
    "# highli rollout",
    "",
    "highli is being introduced as an engineer-first work-history tool.",
    "",
    "You will be able to see your personal timeline, living brag doc, review drafts, and the transparency page before company aggregates go live.",
    "",
    "Manager views do not render teams or individual performance data. The smallest renderable group is a department of at least 25 engineers, or company-only for smaller orgs with at least 12 engineers.",
  ].join("\n");
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}
