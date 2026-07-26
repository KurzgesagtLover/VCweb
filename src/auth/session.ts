import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { hasRole, type Role } from "./permissions";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session || session.user.status !== "ACTIVE") redirect("/login");
  return session;
}

export async function requireRole(minimum: Role) {
  const session = await requireSession();
  if (!hasRole(session.user.role as Role, minimum)) redirect("/unauthorized");
  return session;
}

export class AuthorizationError extends Error {
  constructor(message = "이 작업을 수행할 권한이 없습니다.") {
    super(message);
    this.name = "AuthorizationError";
  }
}
