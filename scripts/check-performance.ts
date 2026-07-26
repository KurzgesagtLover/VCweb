import { sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import { chatMessages, jobs, mapCells } from "../src/db/schema";

async function timedFetch(url: string, init?: RequestInit) {
  const started = performance.now();
  const response = await fetch(url, init);
  const body = await response.arrayBuffer();
  return { response, bytes: body.byteLength, elapsedMs: performance.now() - started };
}

async function checkPerformance() {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const health = await timedFetch(`${baseUrl}/api/health`);
  if (!health.response.ok || health.elapsedMs > 2_000) {
    throw new Error(
      `Health check failed or was slow: ${health.response.status}, ${health.elapsedMs.toFixed(0)} ms`,
    );
  }

  const login = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: "admin@virtual.local", password: "Demo-password-2087" }),
  });
  if (!login.ok) throw new Error(`Performance login failed: ${login.status}`);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  const applyAsAdmin = await fetch(`${baseUrl}/apply`, {
    headers: { Cookie: cookie, Origin: baseUrl },
    redirect: "manual",
  });
  if (
    ![303, 307, 308].includes(applyAsAdmin.status) ||
    applyAsAdmin.headers.get("location") !== "/admin"
  ) {
    throw new Error(
      `Admin/player boundary failed: ${applyAsAdmin.status} ${applyAsAdmin.headers.get("location")}`,
    );
  }
  for (const route of ["/admin", "/admin/users", "/admin/chat", "/admin/moderation"]) {
    const page = await fetch(`${baseUrl}${route}`, {
      headers: { Cookie: cookie, Origin: baseUrl },
    });
    if (!page.ok) throw new Error(`Admin route failed: ${route} (${page.status})`);
  }
  const tile = await timedFetch(`${baseUrl}/api/map/tiles/3/4/3`, {
    headers: { Cookie: cookie, Origin: baseUrl },
  });
  if (!tile.response.ok || tile.elapsedMs > 5_000 || tile.bytes > 2_000_000) {
    throw new Error(
      `Map tile failed limits: ${tile.response.status}, ${tile.elapsedMs.toFixed(0)} ms, ${tile.bytes} bytes`,
    );
  }

  const [cellCount, jobCount, messageCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(mapCells),
    db.select({ count: sql<number>`count(*)::int` }).from(jobs),
    db.select({ count: sql<number>`count(*)::int` }).from(chatMessages),
  ]);
  console.log(
    `Admin routing isolated; health ${health.elapsedMs.toFixed(0)} ms; tile ${tile.elapsedMs.toFixed(0)} ms / ${tile.bytes.toLocaleString()} bytes; ${cellCount[0].count.toLocaleString()} cells; ${jobCount[0].count} jobs; ${messageCount[0].count} chat messages.`,
  );
}

checkPerformance().finally(() => sqlClient.end());
