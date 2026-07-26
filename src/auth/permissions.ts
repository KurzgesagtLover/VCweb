export const roles = ["USER", "PLAYER", "MODERATOR", "ADMIN"] as const;
export type Role = (typeof roles)[number];

const rank: Record<Role, number> = { USER: 0, PLAYER: 1, MODERATOR: 2, ADMIN: 3 };

export function hasRole(actual: Role, minimum: Role) {
  return rank[actual] >= rank[minimum];
}

export function canManageSimulation(role: Role) {
  return role === "ADMIN";
}

export function canModerate(role: Role) {
  return role === "MODERATOR" || role === "ADMIN";
}

export function canViewPrivateCountry(input: {
  role: Role;
  userId: string;
  assignedUserId: string | null;
}) {
  return input.role === "ADMIN" || input.userId === input.assignedUserId;
}
