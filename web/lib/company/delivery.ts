import "server-only";
import { sql } from "drizzle-orm";
import { deliveryMessages } from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import { enqueueJob } from "@/lib/company/job-queue";

export interface DeliveryAdapter {
  channel: "email" | "slack";
  send(input: { recipient: string; subject: string; body: string }): Promise<void>;
}

const devEmailAdapter: DeliveryAdapter = {
  channel: "email",
  async send() {
    return;
  },
};

const devSlackAdapter: DeliveryAdapter = {
  channel: "slack",
  async send() {
    return;
  },
};

export async function deliverManagerDigest(jobId: string): Promise<Record<string, unknown>> {
  const body = [
    "Weekly digest",
    "",
    "Themes come first. Use the link to acknowledge in highli.",
    "",
    "Acknowledge in highli > /manager/digest",
  ].join("\n");

  const adapters = [devEmailAdapter, devSlackAdapter];
  let delivered = 0;

  for (const adapter of adapters) {
    const recipient =
      adapter.channel === "email"
        ? process.env.HIGHLI_DEV_DIGEST_EMAIL ?? "manager@highli.dev"
        : process.env.HIGHLI_DEV_DIGEST_SLACK ?? "#highli-dev";
    await adapter.send({ recipient, subject: "highli weekly digest", body });
    await getCompanyDb().insert(deliveryMessages).values({
      channel: adapter.channel,
      recipient,
      subject: "highli weekly digest",
      body,
      status: "delivered",
      jobId,
      deliveredAt: new Date(),
    });
    delivered += 1;
  }

  return { ok: true, delivered };
}

export async function notifyManagerSurfaceChange(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const summary = String(payload.summary ?? "The manager surface changed.");
  const result = await getCompanyDb().execute(sql`
    INSERT INTO org.manager_surface_changes (change_type, summary, metadata)
    VALUES ('metric-added', ${summary}, ${JSON.stringify(payload)}::jsonb)
    RETURNING id
  `);

  await enqueueJob({
    type: "delivery.manager-digest",
    payload: { reason: "manager-surface-change", summary },
  });

  return { ok: true, changeId: (result as any).rows?.[0]?.id ?? null };
}
