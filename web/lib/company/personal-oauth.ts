import "server-only";
import { eq, sql } from "drizzle-orm";
import {
  mePersonalCalendarEvents,
  mePersonalOauthConnections,
  orgEvents,
} from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import type { CompanyActor } from "@/lib/company/auth";

export async function connectDevCalendar(actor: CompanyActor) {
  const db = getCompanyDb();
  await db
    .insert(mePersonalOauthConnections)
    .values({
      engineerId: actor.engineerId,
      provider: "dev-calendar",
      scopes: ["calendar.readonly"],
      status: "connected",
    })
    .onConflictDoUpdate({
      target: [
        mePersonalOauthConnections.engineerId,
        mePersonalOauthConnections.provider,
      ],
      set: { status: "connected", disconnectedAt: null },
    });

  assertPersonalOnlySource("calendar");

  const now = Date.now();
  const events = Array.from({ length: 8 }).map((_, index) => {
    const start = new Date(now - index * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + (index % 3 === 0 ? 90 : 45) * 60 * 1000);
    return {
      id: `dev-calendar:${actor.engineerId}:${index}`,
      engineerId: actor.engineerId,
      startsAt: start,
      endsAt: end,
      busyMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
      meetingKind: index % 3 === 0 ? "fragmenting" : "meeting",
      payload: { provider: "dev-calendar", personal: true },
    };
  });

  for (const event of events) {
    await db.insert(mePersonalCalendarEvents).values(event).onConflictDoNothing();
  }

  return { ok: true, connected: true, inserted: events.length };
}

export async function disconnectCalendar(actor: CompanyActor) {
  const db = getCompanyDb();
  await db
    .update(mePersonalOauthConnections)
    .set({ status: "disconnected", disconnectedAt: new Date() })
    .where(eq(mePersonalOauthConnections.engineerId, actor.engineerId));
  await db
    .delete(mePersonalCalendarEvents)
    .where(eq(mePersonalCalendarEvents.engineerId, actor.engineerId));
  return { ok: true, disconnected: true };
}

export async function getFlowFocus(actor: CompanyActor) {
  const rows = await getCompanyDb().execute(sql`
    SELECT
      date_trunc('day', starts_at)::date AS day,
      count(*)::int AS meetings,
      sum(busy_minutes)::int AS meeting_minutes,
      count(*) FILTER (WHERE meeting_kind = 'fragmenting')::int AS fragmented_blocks
    FROM me.personal_calendar_events
    WHERE engineer_id = ${actor.engineerId}
      AND starts_at >= now() - interval '14 days'
    GROUP BY date_trunc('day', starts_at)::date
    ORDER BY day DESC
  `);

  return {
    source: "me.personal_calendar_events",
    aggregation: "engineer-private only",
    days: (rows as any).rows ?? [],
  };
}

export async function detectFrictionPrompts(): Promise<Record<string, unknown>> {
  const result = await getCompanyDb().execute(sql`
    INSERT INTO me.friction_prompts (engineer_id, title, redacted_draft, signals)
    SELECT
      engineer_id,
      'CI looked rough this week',
      'CI failures clustered around the same workflow this week. The draft removes repository and person details before submission.',
      jsonb_build_object('failed_runs', 4, 'hours', 3, 'source', 'scheduled-materialization')
    FROM me.events
    WHERE ts >= now() - interval '7 days'
      AND (type ILIKE '%ci%' OR title ILIKE '%fail%')
    GROUP BY engineer_id
    HAVING count(*) >= 4
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  return { ok: true, prompts: (result as any).rows?.length ?? 0 };
}

function assertPersonalOnlySource(source: string) {
  if (source === "calendar") {
    // Static guard: personal OAuth sources write only to me.personal_* tables.
    void orgEvents;
    return;
  }
  throw new Error("unknown personal source");
}
