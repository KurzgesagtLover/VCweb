import Decimal from "decimal.js";

export function clampPoliticalMetric(value: number) {
  if (!Number.isFinite(value)) throw new Error("정치 지표는 유한한 숫자여야 합니다.");
  return Math.max(0, Math.min(100, Math.round(value)));
}

export type PartySupport = {
  id: string;
  support: string;
  fixed?: boolean;
  minimum?: string;
};

export function normalizePartySupport(parties: PartySupport[]): PartySupport[] {
  if (parties.length === 0) return [];
  const one = new Decimal(1);
  const normalized = parties.map((party) => ({
    ...party,
    support: Decimal.max(party.support, party.minimum ?? 0).toString(),
  }));
  const fixedTotal = normalized
    .filter((party) => party.fixed)
    .reduce((sum, party) => sum.plus(party.support), new Decimal(0));
  if (fixedTotal.gt(one)) throw new Error("고정 정당 지지율 합계가 100%를 넘습니다.");

  const flexible = normalized.filter((party) => !party.fixed);
  const available = one.minus(fixedTotal);
  if (flexible.length === 0) {
    if (!fixedTotal.eq(one)) throw new Error("고정 정당만 있을 때 지지율 합계는 100%여야 합니다.");
    return normalized;
  }

  const minTotal = flexible.reduce((sum, party) => sum.plus(party.minimum ?? 0), new Decimal(0));
  if (minTotal.gt(available)) throw new Error("최소 지지율 합계가 배분 가능 범위를 넘습니다.");

  const flexibleExcess = flexible.reduce(
    (sum, party) => sum.plus(new Decimal(party.support).minus(party.minimum ?? 0)),
    new Decimal(0),
  );
  const distributable = available.minus(minTotal);

  return normalized.map((party) => {
    if (party.fixed) return party;
    const minimum = new Decimal(party.minimum ?? 0);
    const excess = new Decimal(party.support).minus(minimum);
    const share = flexibleExcess.isZero()
      ? distributable.div(flexible.length)
      : distributable.mul(excess).div(flexibleExcess);
    return { ...party, support: minimum.plus(share).toDecimalPlaces(7).toString() };
  });
}
