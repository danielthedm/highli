import "dotenv/config";

const { runOneJob } = await import("../../web/lib/company/worker.ts");

const queue = process.env.HIGHLI_WORKER_QUEUE ?? "default";
const once = process.argv.includes("--once");

async function tick() {
  const result = await runOneJob(queue);
  if (result.ran) {
    console.log(
      `${new Date().toISOString()} ${result.status} ${result.type} ${result.jobId}`,
    );
  }
}

if (once) {
  await tick();
  process.exit(0);
}

console.log(`highli worker running queue=${queue}`);
for (;;) {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
