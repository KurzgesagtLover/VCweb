const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

export type EconomicSystem = "FREE_MARKET" | "PLANNED";

export function calculatePromotionState(input: {
  currentAwareness: number;
  cumulativeSpend: number;
  policyBudget: number;
}) {
  const currentAwareness = clamp(input.currentAwareness, 0, 100);
  const referenceBudget = Math.max(Math.abs(input.policyBudget), 1);
  const spendRatio = Math.max(input.cumulativeSpend, 0) / referenceBudget;
  const response = sigmoid(7 * (spendRatio - 0.32));
  const baseline = sigmoid(-2.24);
  const normalizedResponse = clamp((response - baseline) / (1 - baseline), 0, 1);
  const awarenessGain = (100 - currentAwareness) * normalizedResponse * 0.72;
  const awareness = clamp(currentAwareness + awarenessGain, 0, 100);

  const saturation = sigmoid((awareness - 87) / 3.5);
  const excessSpend = Math.max(0, spendRatio - 0.85);
  const overpromotionPenalty = clamp(saturation * excessSpend * 0.42, 0, 0.48);

  return { awareness, overpromotionPenalty, spendRatio };
}

export function calculatePolicyEffectiveness(input: {
  stability: number;
  governmentApproval: number;
  policySupport: number;
  stateCapacity: number;
  awareness: number;
  overpromotionPenalty?: number;
  economicSystem: EconomicSystem;
  verdict?: "SUCCESS" | "PARTIAL" | "FAILURE" | "DELAYED" | "NEEDS_ADMIN";
}) {
  const administration = 0.78 + 0.42 * sigmoid((clamp(input.stateCapacity, 0, 100) - 50) / 13);
  const politicalRoom =
    0.82 +
    0.28 *
      sigmoid(
        (clamp(input.stability, 0, 100) +
          clamp(input.governmentApproval, 0, 100) +
          clamp(input.policySupport, 0, 100) -
          150) /
          28,
      );
  const awareness = 0.66 + 0.46 * sigmoid((clamp(input.awareness, 0, 100) - 42) / 11);
  const planned =
    input.economicSystem === "PLANNED" ? (input.verdict === "FAILURE" ? 1.28 : 1.14) : 1;
  const penalty = 1 - clamp(input.overpromotionPenalty ?? 0, 0, 0.48);
  return clamp(administration * politicalRoom * awareness * planned * penalty, 0.5, 1.55);
}

export function initialPolicyReception(input: {
  verdict: "SUCCESS" | "PARTIAL" | "FAILURE" | "DELAYED" | "NEEDS_ADMIN";
  confidence: number;
  bodyLength: number;
}) {
  const awareness = clamp(
    16 + input.confidence * 22 + Math.min(input.bodyLength / 160, 14),
    12,
    52,
  );
  const verdictImpulse = {
    SUCCESS: 10,
    PARTIAL: 4,
    FAILURE: -11,
    DELAYED: -2,
    NEEDS_ADMIN: 0,
  }[input.verdict];
  const policySupport = clamp(50 + verdictImpulse * (0.58 + awareness / 180), 20, 80);
  return { awareness, policySupport };
}

export function calculatePromotedPolicySupport(input: {
  currentSupport: number;
  awareness: number;
  verdict: "SUCCESS" | "PARTIAL" | "FAILURE" | "DELAYED" | "NEEDS_ADMIN";
}) {
  const verdictSignal = {
    SUCCESS: 1,
    PARTIAL: 0.45,
    FAILURE: -1,
    DELAYED: -0.25,
    NEEDS_ADMIN: 0,
  }[input.verdict];
  const target = clamp(50 + verdictSignal * (8 + clamp(input.awareness, 0, 100) * 0.22), 15, 85);
  return clamp(input.currentSupport + (target - input.currentSupport) * 0.32, 0, 100);
}

export function estimatePovertyRate(input: {
  incomeGini: number;
  unemploymentRate: number;
  inflationRate: number;
}) {
  return clamp(
    0.035 +
      Math.max(0, input.incomeGini - 0.25) * 0.62 +
      Math.max(0, input.unemploymentRate - 0.035) * 0.92 +
      Math.max(0, input.inflationRate - 0.03) * 0.32,
    0.02,
    0.65,
  );
}

export function calculatePoliticalState(input: {
  currentStability: number;
  currentPolicySupport: number;
  governmentApproval: number;
  stateCapacity: number;
  unrest: number;
  realGdpGrowth: number;
  inflationRate: number;
  previousInflationRate: number;
  unemploymentRate: number;
  previousUnemploymentRate: number;
  incomeGini: number;
  activePolicyImpulse: number;
}) {
  const persistentUnemployment =
    input.unemploymentRate > 0.055 && input.previousUnemploymentRate > 0.055 ? 1.22 : 1;
  const persistentInflation =
    input.inflationRate > 0.045 && input.previousInflationRate > 0.045 ? 1.2 : 1;

  const unemploymentPenalty =
    17 * sigmoid((input.unemploymentRate - 0.072) * 52) * persistentUnemployment;
  const inflationPenalty = 15 * sigmoid((input.inflationRate - 0.06) * 44) * persistentInflation;
  const deflationPenalty = 5 * sigmoid((-input.inflationRate - 0.008) * 70);
  const inequalityPenalty = 11 * sigmoid((input.incomeGini - 0.4) * 16);
  const povertyRate = estimatePovertyRate(input);
  const povertyPenalty = 12 * sigmoid((povertyRate - 0.18) * 14);
  const recessionPenalty = clamp(Math.max(0, -input.realGdpGrowth) * 90, 0, 10);

  const policySupport = clamp(
    input.currentPolicySupport +
      (50 - input.currentPolicySupport) * 0.09 +
      clamp(input.activePolicyImpulse, -4, 4),
    0,
    100,
  );
  const governmentApproval = clamp(
    input.governmentApproval + clamp((policySupport - 50) * 0.03, -1.5, 1.5),
    0,
    100,
  );

  const stabilityTarget = clamp(
    76 +
      (governmentApproval - 50) * 0.24 +
      (policySupport - 50) * 0.2 +
      (input.stateCapacity - 50) * 0.16 -
      input.unrest * 0.12 -
      unemploymentPenalty -
      inflationPenalty -
      deflationPenalty -
      inequalityPenalty -
      povertyPenalty -
      recessionPenalty,
    0,
    100,
  );
  const stability = clamp(
    input.currentStability + (stabilityTarget - input.currentStability) * 0.28,
    0,
    100,
  );

  return {
    stability: Math.round(stability),
    policySupport: Math.round(policySupport),
    governmentApproval: Math.round(governmentApproval),
    povertyRate,
    components: {
      unemploymentPenalty,
      inflationPenalty,
      deflationPenalty,
      inequalityPenalty,
      povertyPenalty,
      recessionPenalty,
    },
  };
}
