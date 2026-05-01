import "server-only";
import {
  claimNextJob,
  completeJob,
  failJob,
  registerDefaultSchedules,
} from "@/lib/company/job-queue";
import { runJobHandler } from "@/lib/company/job-handlers";

export async function runOneJob(queue = "default"): Promise<{
  ran: boolean;
  jobId?: string;
  type?: string;
  status?: "succeeded" | "failed";
}> {
  await registerDefaultSchedules();
  const job = await claimNextJob(queue);
  if (!job) return { ran: false };

  try {
    const result = await runJobHandler(job);
    await completeJob(job.id, result);
    return { ran: true, jobId: job.id, type: job.type, status: "succeeded" };
  } catch (error) {
    await failJob(job, error);
    return { ran: true, jobId: job.id, type: job.type, status: "failed" };
  }
}
