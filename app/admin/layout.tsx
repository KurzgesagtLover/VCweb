import { requireRole } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import { AppShell } from "@/src/ui/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("MODERATOR");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return children;
  return (
    <AppShell
      session={session}
      context={{ campaign: context.campaign, country: context.country, turn: context.turn }}
      mode="admin"
    >
      {children}
    </AppShell>
  );
}
