"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { notifications } from "@/src/db/schema";

export async function markAllNotificationsReadAction() {
  const session = await requireSession();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)));
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}
