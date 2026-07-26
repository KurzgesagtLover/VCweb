import type { Role } from "@/src/auth/permissions";

export type ChatChannelKind = "CAMPAIGN" | "COUNTRY" | "ANNOUNCEMENT";

export function canReadChatChannel(input: {
  role: Role;
  assignedCountryId: string | null;
  channelType: ChatChannelKind;
  channelCountryId: string | null;
}) {
  if (input.role === "ADMIN" || input.role === "MODERATOR") return true;
  if (input.role !== "PLAYER") return false;
  if (input.channelType !== "COUNTRY") return true;
  return input.assignedCountryId === input.channelCountryId;
}

export function canPostChatChannel(input: {
  role: Role;
  assignedCountryId: string | null;
  channelType: ChatChannelKind;
  channelCountryId: string | null;
}) {
  if (input.channelType === "ANNOUNCEMENT") return input.role === "ADMIN";
  if (input.channelType === "COUNTRY") {
    return input.role === "PLAYER" && input.assignedCountryId === input.channelCountryId;
  }
  return input.role === "PLAYER" || input.role === "MODERATOR" || input.role === "ADMIN";
}

export function remainingTimeoutMs(
  latestAction: { type: "TIMEOUT_USER" | "CLEAR_TIMEOUT"; expiresAt: Date | null } | null,
  now = new Date(),
) {
  if (!latestAction || latestAction.type === "CLEAR_TIMEOUT" || !latestAction.expiresAt) return 0;
  return Math.max(0, latestAction.expiresAt.getTime() - now.getTime());
}
