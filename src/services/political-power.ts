import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { countryPoliticalResources } from "@/src/db/schema";
import {
  accruePoliticalPower,
  type PoliticalPowerClock,
} from "@/src/domain/politics/political-power";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 국가 정치력 행을 잠그고 마지막 정산 이후 실시간으로 쌓인(또는 유지비로 빠진) 만큼 반영한다.
 * 같은 트랜잭션 안에서 잔고를 바꾸려면 이 함수가 돌려준 행을 기준으로 갱신한다.
 */
export async function lockAndAccruePoliticalPower(
  tx: DatabaseTransaction,
  countryId: string,
  clock: PoliticalPowerClock,
  now = new Date(),
) {
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
    id: resource.id,
    balance,
    incomePerGameDay: resource.incomePerGameDay,
    incomePerRealSecond: accrued.incomePerRealSecond.toString(),
    serverNow: now.toISOString(),
  };
}

export async function getPoliticalPowerState(
  countryId: string,
  clock: PoliticalPowerClock,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const resource = await lockAndAccruePoliticalPower(tx, countryId, clock, now);
    return {
      balance: resource.balance,
      incomePerGameDay: resource.incomePerGameDay,
      incomePerRealSecond: resource.incomePerRealSecond,
      serverNow: resource.serverNow,
    };
  });
}
