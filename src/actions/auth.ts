"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/src/auth/auth";
import { db } from "@/src/db";
import { campaignMemberships, campaigns } from "@/src/db/schema";

export type FormState = { error?: string; success?: string };

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(10).max(128),
});

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "이메일과 10자 이상의 비밀번호를 확인해 주세요." };

  let role: string | null | undefined;
  try {
    const result = await auth.api.signInEmail({ body: parsed.data });
    role = result.user.role;
  } catch {
    return { error: "이메일 또는 비밀번호를 확인해 주세요." };
  }
  if (role === "ADMIN") redirect("/admin");
  if (role === "MODERATOR") redirect("/admin/moderation");
  redirect("/world-intro");
}

const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(50) });

export async function registerAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "이름, 이메일, 10자 이상의 비밀번호를 확인해 주세요." };

  try {
    const result = await auth.api.signUpEmail({ body: parsed.data });
    const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.isActive, true) });
    if (campaign) {
      await db
        .insert(campaignMemberships)
        .values({ campaignId: campaign.id, userId: result.user.id, role: "USER" })
        .onConflictDoNothing();
    }
  } catch {
    return { error: "가입을 완료할 수 없습니다. 입력값을 확인하거나 잠시 후 다시 시도해 주세요." };
  }
  redirect("/world-intro");
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
