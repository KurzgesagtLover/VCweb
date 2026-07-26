import { sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import { processNextJob } from "../src/services/job-runner";
import { runScheduledTurnTick } from "../src/services/turn-scheduler";

let stopped = false;

async function start() {
  await db.execute(sql`select 1`);
  console.log("Worker is ready. Turn, judgment, event, and diplomacy handlers are active.");
  let nextScheduleCheck = 0;
  while (!stopped) {
    const now = Date.now();
    if (now >= nextScheduleCheck) {
      try {
        await runScheduledTurnTick(new Date(now));
      } catch (error) {
        console.error("Scheduled turn processing failed.", error);
      }
      nextScheduleCheck = now + 5_000;
    }
    const worked = await processNextJob();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopped = true;
    void sqlClient.end();
  });
}

void start();
