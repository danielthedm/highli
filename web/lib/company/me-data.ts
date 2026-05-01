import "server-only";
import { and, desc, eq } from "drizzle-orm";
import {
  meAuditEvents,
  meCareerGoals,
  meDocuments,
  meEvents,
  meMaterializations,
  meStars,
} from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import { enqueueJob } from "@/lib/company/job-queue";
import type { CompanyActor } from "@/lib/company/auth";

export async function listExpansiveEvents(actor: CompanyActor, limit = 200) {
  return getCompanyDb()
    .select()
    .from(meEvents)
    .where(eq(meEvents.engineerId, actor.engineerId))
    .orderBy(desc(meEvents.ts))
    .limit(limit);
}

export async function getGoal(actor: CompanyActor) {
  const [goal] = await getCompanyDb()
    .select()
    .from(meCareerGoals)
    .where(eq(meCareerGoals.engineerId, actor.engineerId))
    .orderBy(desc(meCareerGoals.createdAt))
    .limit(1);
  return goal ?? null;
}

export async function setGoal(
  actor: CompanyActor,
  input: { text: string; level?: string; skills?: string; growthAreas?: string },
) {
  const [goal] = await getCompanyDb()
    .insert(meCareerGoals)
    .values({
      engineerId: actor.engineerId,
      text: input.text,
      level: input.level ?? null,
      skills: input.skills ?? null,
      growthAreas: input.growthAreas ?? null,
    })
    .returning();
  return goal;
}

export async function listGoalHistory(actor: CompanyActor) {
  return getCompanyDb()
    .select()
    .from(meCareerGoals)
    .where(eq(meCareerGoals.engineerId, actor.engineerId))
    .orderBy(desc(meCareerGoals.createdAt));
}

export async function listStars(actor: CompanyActor) {
  const rows = await getCompanyDb()
    .select({ eventId: meStars.eventId, starredAt: meStars.starredAt })
    .from(meStars)
    .where(eq(meStars.engineerId, actor.engineerId))
    .orderBy(desc(meStars.starredAt));
  return rows;
}

export async function setStar(actor: CompanyActor, eventId: string) {
  await getCompanyDb()
    .insert(meStars)
    .values({ engineerId: actor.engineerId, eventId })
    .onConflictDoNothing();
}

export async function deleteStar(actor: CompanyActor, eventId: string) {
  await getCompanyDb()
    .delete(meStars)
    .where(and(eq(meStars.engineerId, actor.engineerId), eq(meStars.eventId, eventId)));
}

export async function listDocuments(actor: CompanyActor, kind?: string | null) {
  const db = getCompanyDb();
  const base = db.select().from(meDocuments);
  const where = kind
    ? and(eq(meDocuments.engineerId, actor.engineerId), eq(meDocuments.kind, kind))
    : eq(meDocuments.engineerId, actor.engineerId);
  return base.where(where).orderBy(desc(meDocuments.updatedAt));
}

export async function saveDocument(
  actor: CompanyActor,
  input: {
    kind: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  },
) {
  const [document] = await getCompanyDb()
    .insert(meDocuments)
    .values({
      engineerId: actor.engineerId,
      kind: input.kind,
      title: input.title,
      content: input.content,
      metadata: input.metadata ?? null,
    })
    .returning();
  return document;
}

export async function getHighlights(actor: CompanyActor) {
  const [materialized] = await getCompanyDb()
    .select()
    .from(meMaterializations)
    .where(and(eq(meMaterializations.engineerId, actor.engineerId), eq(meMaterializations.kind, "highlights")))
    .orderBy(desc(meMaterializations.generatedAt))
    .limit(1);

  const stale =
    !materialized ||
    Date.now() - materialized.generatedAt.getTime() > 24 * 60 * 60 * 1000;

  let refreshJobId: string | null = null;
  if (stale) {
    const job = await enqueueJob({
      type: "me.highlights",
      payload: { engineerId: actor.engineerId },
      idempotencyKey: `me.highlights:${actor.engineerId}`,
    });
    refreshJobId = job.id;
  }

  return {
    highlights: materialized?.value?.highlights ?? [],
    freshness: {
      generatedAt: materialized?.generatedAt ?? null,
      stale,
      refreshJobId,
      status: materialized?.status ?? "missing",
    },
  };
}

export async function materializeHighlights(engineerId: string) {
  const events = await getCompanyDb()
    .select()
    .from(meEvents)
    .where(eq(meEvents.engineerId, engineerId))
    .orderBy(desc(meEvents.ts))
    .limit(20);

  const highlights = events.slice(0, 3).map((event) => ({
    eventId: event.id,
    title: event.title,
    oneLiner: event.summary ?? "Recent evidence from the expansive doc.",
  }));

  const [row] = await getCompanyDb()
    .insert(meMaterializations)
    .values({
      engineerId,
      kind: "highlights",
      value: { highlights, fallback: true },
      status: "fresh",
    })
    .returning();

  return { ok: true, materializationId: row.id, highlights: highlights.length };
}

export async function recordAudit(
  actor: CompanyActor,
  input: { type: string; summary: string; metadata?: Record<string, unknown> },
) {
  const [event] = await getCompanyDb()
    .insert(meAuditEvents)
    .values({
      engineerId: actor.engineerId,
      type: input.type,
      summary: input.summary,
      metadata: input.metadata ?? null,
    })
    .returning();
  return event;
}

export async function listAudit(actor: CompanyActor) {
  return getCompanyDb()
    .select()
    .from(meAuditEvents)
    .where(eq(meAuditEvents.engineerId, actor.engineerId))
    .orderBy(desc(meAuditEvents.createdAt))
    .limit(100);
}
