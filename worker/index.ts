import { sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import { processNextJob } from "../src/services/job-runner";
import { runRealtimeTick } from "../src/services/realtime";
import { runScheduledTurnTick } from "../src/services/turn-scheduler";

let stopped = false;

async function start() {
  await db.execute(sql`select 1`);
  console.log(
    "Worker is ready. Turn, judgment, event, diplomacy and realtime handlers are active.",
  );
  let nextScheduleCheck = 0;
  while (!stopped) {
    const now = Date.now();
    if (now >= nextScheduleCheck) {
      try {
        await runScheduledTurnTick(new Date(now));
      } catch (error) {
        console.error("Scheduled turn processing failed.", error);
      }
      try {
        await runRealtimeTick(new Date(now));
      } catch (error) {
        console.error("Realtime processing failed.", error);
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
