import "server-only";
import { detectFrictionPrompts } from "@/lib/company/personal-oauth";
import { materializeHighlights } from "@/lib/company/me-data";
import { generateMetricThemes } from "@/lib/company/org-data";
import { generateAnonymousThemes } from "@/lib/company/anon-data";
import { deliverManagerDigest, notifyManagerSurfaceChange } from "@/lib/company/delivery";
import { runProviderIngestion } from "@/lib/company/provider-ingestion";
import type { HighliJob } from "@/lib/company/job-queue";

export async function runJobHandler(job: HighliJob): Promise<Record<string, unknown>> {
  switch (job.type) {
    case "noop":
      return { ok: true };
    case "github.sync":
      return runProviderIngestion("github", job.payload);
    case "linear.sync":
      return runProviderIngestion("linear", job.payload);
    case "friction.detect":
      return detectFrictionPrompts();
    case "me.highlights":
      return materializeHighlights(String(job.payload.engineerId));
    case "anon.themes":
      return generateAnonymousThemes();
    case "org.metric-themes":
      return generateMetricThemes();
    case "delivery.manager-digest":
      return deliverManagerDigest(job.id);
    case "delivery.transparency-change":
      return notifyManagerSurfaceChange(job.payload);
    case "survey.distribute":
      return { ok: true, adapter: "dev", surveyId: job.payload.surveyId ?? null };
    default:
      return { ok: true, skipped: true, type: job.type };
  }
}
