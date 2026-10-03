import { describe, expect, it } from "vitest";
import {
  defaultDiplomaticStatus,
  diplomaticStatusLabel,
  resolveDiplomaticStatus,
} from "@/src/domain/diplomacy/status";

describe("diplomatic status", () => {
  it("treats countries in the same bloc as allies", () => {
    expect(
      resolveDiplomaticStatus({ outgoing: "NORMAL", incoming: "NORMAL", sameBloc: true }),
    ).toEqual({ status: "ALLIANCE", direction: "SYMMETRIC" });
  });

  it("preserves the direction of an independence guarantee", () => {
    const outgoing = resolveDiplomaticStatus({ outgoing: "INDEPENDENCE_GUARANTEE" });
    const incoming = resolveDiplomaticStatus({ incoming: "INDEPENDENCE_GUARANTEE" });

    expect(outgoing).toEqual({ status: "INDEPENDENCE_GUARANTEE", direction: "OUTGOING" });
    expect(incoming).toEqual({ status: "INDEPENDENCE_GUARANTEE", direction: "INCOMING" });
    expect(diplomaticStatusLabel(incoming.status, incoming.direction)).toBe("독립 보장받음");
  });

  it("resolves symmetric conflict states from either relation row", () => {
    expect(resolveDiplomaticStatus({ incoming: "WAR" })).toEqual({
      status: "WAR",
      direction: "SYMMETRIC",
    });
    expect(resolveDiplomaticStatus({ outgoing: "CIVIL_WAR" })).toEqual({
      status: "CIVIL_WAR",
      direction: "SYMMETRIC",
    });
  });

  it("defaults only ordinary states to normal relations", () => {
    expect(defaultDiplomaticStatus("STATE", "PARTIALLY_RECOGNIZED_STATE")).toBe("NORMAL");
    expect(defaultDiplomaticStatus("STATE", "QUASI_STATE")).toBe("NO_RELATIONS");
    expect(defaultDiplomaticStatus("ARMED_GROUP", "STATE")).toBe("NO_RELATIONS");
    expect(defaultDiplomaticStatus("GUERRILLA_GROUP", "STATE")).toBe("NO_RELATIONS");
  });
});
