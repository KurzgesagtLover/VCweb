import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/src/db";
import { accounts, sessions, users, verifications } from "@/src/db/schema";
import { getEnv } from "@/src/config/env";

const env = getEnv();

export const auth = betterAuth({
  baseURL: env.APP_BASE_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  user: {
    additionalFields: {
      role: {
        type: ["USER", "PLAYER", "MODERATOR", "ADMIN"],
        required: false,
        defaultValue: "USER",
        input: false,
      },
      status: {
        type: ["ACTIVE", "SUSPENDED"],
        required: false,
        defaultValue: "ACTIVE",
        input: false,
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  rateLimit: { enabled: true, window: 60, max: 20 },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    cookiePrefix: "virtual_nation",
  },
  plugins: [nextCookies()],
});

export type AppSession = typeof auth.$Infer.Session;
