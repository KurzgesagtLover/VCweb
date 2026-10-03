import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { countryPoliticalResources } from "@/src/db/schema";
import {
  accruePoliticalPower,
  type PoliticalPowerClock,
} from "@/src/domain/politics/political-power";

export async function getPoliticalPowerState(
  countryId: string,
  clock: PoliticalPowerClock,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    let [resource] = await tx
      .select()
      .from(countryPoliticalResources)
      .where(eq(countryPoliticalResources.countryId, countryId))
      .limit(1)
      .for("update");

    if (!resource) {
      await tx
        .insert(countryPoliticalResources)
        .values({ countryId, lastAccruedAt: now })
        .onConflictDoNothing({ target: countryPoliticalResources.countryId });
      [resource] = await tx
        .select()
        .from(countryPoliticalResources)
        .where(eq(countryPoliticalResources.countryId, countryId))
        .limit(1)
        .for("update");
    }
    if (!resource) throw new Error("정치력 자원을 초기화할 수 없습니다.");

    const elapsedRealSeconds = Math.max(0, now.getTime() - resource.lastAccruedAt.getTime()) / 1000;
    const accrued = accruePoliticalPower({
      balance: resource.balance,
      incomePerGameDay: resource.incomePerGameDay,
      elapsedRealSeconds,
      clock,
    });
    const balance = accrued.balance.toDecimalPlaces(4).toString();

    await tx
      .update(countryPoliticalResources)
      .set({ balance, lastAccruedAt: now, updatedAt: now })
      .where(eq(countryPoliticalResources.id, resource.id));

    return {
      balance,
      incomePerGameDay: resource.incomePerGameDay,
      incomePerRealSecond: accrued.incomePerRealSecond.toString(),
      serverNow: now.toISOString(),
    };
  });
}
