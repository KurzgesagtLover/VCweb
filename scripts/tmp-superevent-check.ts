import { eq } from "drizzle-orm";
import { db, sqlClient } from "@/src/db";
import { campaigns, superEvents, users } from "@/src/db/schema";

async function main() {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.isActive, true) });
  const admin = await db.query.users.findFirst({ where: eq(users.email, "admin@virtual.local") });
  if (!campaign || !admin) throw new Error("campaign or admin missing");
  const [row] = await db
    .insert(superEvents)
    .values({
      campaignId: campaign.id,
      status: "BROADCAST",
      audience: "ALL",
      codeName: "SE-0114",
      sourceLabel: "중앙방송위원회 // 전대역 송출",
      title: "가능성의 죽음",
      subtitle: "제3차 통합 의정서 발효 — 모든 국가의 독자 항행권이 정지되었습니다",
      body: [
        "오늘 0시를 기해 대양 항행 협정이 정지되었습니다. 각국 선단은 지정 해역 밖으로 이동할 수 없으며, 위반 선박은 통고 없이 나포됩니다.",
        "중앙은 이 조치가 한시적이라고 밝혔습니다. 그러나 해제 시점은 공표되지 않았습니다.",
      ].join("\n\n"),
      footnote: "이 송출은 기록되며, 열람 사실은 보고됩니다.",
      stampText: "체제 승인",
      imageUrl: "/gate/voyager.jpg",
      imageAlt: "정지된 궤도 위의 탐사선",
      audioUrl: "/ost/general-05.mp3",
      audioVolume: 60,
      dismissLabel: "확인했습니다",
      holdSeconds: 3,
      createdBy: admin.id,
      broadcastAt: new Date(),
    })
    .returning({ id: superEvents.id });
  await sqlClient.notify(
    "superevent_events",
    JSON.stringify({ campaignId: campaign.id, superEventId: row.id }),
  );
  console.log("inserted", row.id);
  await sqlClient.end();
}

void main();
