import { z } from "zod";
import type { CountryEntityType } from "@/src/domain/country/entity-type";

export const diplomaticRelationStatusSchema = z.enum([
  "NORMAL",
  "WAR",
  "CIVIL_WAR",
  "TRUCE",
  "MUTUAL_DEFENSE",
  "INDEPENDENCE_GUARANTEE",
  "NO_RELATIONS",
  "STALEMATE",
  "GUERRILLA",
]);

export type DiplomaticRelationStatus = z.infer<typeof diplomaticRelationStatusSchema>;
export type EffectiveDiplomaticStatus = DiplomaticRelationStatus | "ALLIANCE";
export type DiplomaticStatusDirection = "SYMMETRIC" | "OUTGOING" | "INCOMING";

export function defaultDiplomaticStatus(
  firstType: CountryEntityType,
  secondType: CountryEntityType,
): DiplomaticRelationStatus {
  if (firstType === "STATE" || firstType === "PARTIALLY_RECOGNIZED_STATE") {
    if (secondType === "STATE" || secondType === "PARTIALLY_RECOGNIZED_STATE") return "NORMAL";
  }
  return "NO_RELATIONS";
}

export const DIPLOMATIC_STATUS_LABELS: Record<EffectiveDiplomaticStatus, string> = {
  NORMAL: "수교",
  WAR: "전쟁",
  CIVIL_WAR: "내전",
  TRUCE: "휴전",
  ALLIANCE: "동맹",
  MUTUAL_DEFENSE: "상호방위조약",
  INDEPENDENCE_GUARANTEE: "독립 보장",
  NO_RELATIONS: "미수교",
  STALEMATE: "교착",
  GUERRILLA: "게릴라전",
};

export const SYMMETRIC_DIPLOMATIC_STATUSES = new Set<DiplomaticRelationStatus>([
  "NORMAL",
  "WAR",
  "CIVIL_WAR",
  "TRUCE",
  "MUTUAL_DEFENSE",
  "NO_RELATIONS",
  "STALEMATE",
  "GUERRILLA",
]);

export const diplomaticProposalIntentSchema = z.enum([
  "GENERAL",
  "ALLIANCE_FOUNDATION",
  "MUTUAL_DEFENSE",
  "INDEPENDENCE_GUARANTEE",
  "TRUCE",
]);

export type DiplomaticProposalIntent = z.infer<typeof diplomaticProposalIntentSchema>;

export function resolveDiplomaticStatus(input: {
  outgoing?: DiplomaticRelationStatus | null;
  incoming?: DiplomaticRelationStatus | null;
  sameBloc?: boolean;
  defaultStatus?: DiplomaticRelationStatus;
}): { status: EffectiveDiplomaticStatus; direction: DiplomaticStatusDirection } {
  if (input.sameBloc) return { status: "ALLIANCE", direction: "SYMMETRIC" };
  const outgoing = input.outgoing ?? input.defaultStatus ?? "NORMAL";
  const incoming = input.incoming ?? input.defaultStatus ?? "NORMAL";
  if (outgoing !== "NORMAL") {
    return {
      status: outgoing,
      direction: outgoing === "INDEPENDENCE_GUARANTEE" ? "OUTGOING" : "SYMMETRIC",
    };
  }
  if (incoming === "INDEPENDENCE_GUARANTEE") {
    return { status: incoming, direction: "INCOMING" };
  }
  if (incoming !== "NORMAL") return { status: incoming, direction: "SYMMETRIC" };
  return { status: "NORMAL", direction: "SYMMETRIC" };
}

export function diplomaticStatusLabel(
  status: EffectiveDiplomaticStatus,
  direction: DiplomaticStatusDirection = "SYMMETRIC",
) {
  if (status === "INDEPENDENCE_GUARANTEE" && direction === "INCOMING") {
    return "독립 보장받음";
  }
  return DIPLOMATIC_STATUS_LABELS[status];
}
