"use server";

import Decimal from "decimal.js";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole, requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  campaignMemberships,
  chatChannelMembers,
  chatChannels,
  countries,
  countryDevelopmentTracks,
  countryPoliticalResources,
  countryApplications,
  countryAssignments,
  countryOffices,
  countryProfileRevisions,
  countrySetupSubmissions,
  demographicSnapshots,
  economicSectors,
  economicSnapshots,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  politicalSnapshots,
  turns,
  users,
} from "@/src/db/schema";
import { getActiveCampaign, getViewerContext } from "@/src/db/queries/viewer";
import { deriveCountrySetup, quickCountrySetupSchema } from "@/src/domain/country/setup";
import { defaultDevelopmentTrackRows } from "@/src/domain/development/tracks";
import { ECONOMY_STATISTICS_CURRENCY } from "@/src/domain/economy/currency";
import { standardEconomicSectorRows } from "@/src/domain/economy/sectors";
import { deleteCountryFully } from "@/src/services/delete-country";
import type { FormState } from "./auth";

const applicationSchema = z.object({
  countryId: z.string().uuid().nullable(),
  kind: z.enum(["ASSIGN", "TRANSFER", "RELEASE"]),
  reason: z.string().trim().max(1000),
});

const createCountrySchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/),
  controlType: z.enum(["PLAYER", "AI"]),
});

export async function createCountryAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");

  const parsed = createCountrySchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    controlType: formData.get("controlType"),
  });
  if (!parsed.success) throw new Error("국명과 국가 코드를 확인해 주세요.");

  const duplicate = await db.query.countries.findFirst({
    where: and(eq(countries.campaignId, context.campaign.id), eq(countries.code, parsed.data.code)),
  });
  if (duplicate) throw new Error("이미 사용 중인 국가 코드입니다.");

  await db.transaction(async (tx) => {
    const [country] = await tx
      .insert(countries)
      .values({
        campaignId: context.campaign!.id,
        name: parsed.data.name,
        code: parsed.data.code,
        color: "#5C6670",
        isAi: parsed.data.controlType === "AI",
        setupStatus: "DRAFT",
      })
      .returning();
    await tx.insert(countryDevelopmentTracks).values(defaultDevelopmentTrackRows(country.id));
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "CREATE_COUNTRY",
      targetType: "COUNTRY",
      targetId: country.id,
      afterSummary: {
        name: country.name,
        code: country.code,
        isAi: country.isAi,
      },
      reason: "관리자 국가 생성",
    });
  });

  revalidatePath("/admin");
  revalidatePath("/admin/countries");
  revalidatePath("/admin/users");
  revalidatePath("/admin/economy");
  revalidatePath("/admin/politics");
}

export async function updateCountryEconomicSystemAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const countryId = z.string().uuid().parse(formData.get("countryId"));
  const economicSystem = z.enum(["FREE_MARKET", "PLANNED"]).parse(formData.get("economicSystem"));
  const country = await db.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");
  await db.transaction(async (tx) => {
    await tx
      .update(countries)
      .set({ economicSystem, updatedAt: new Date() })
      .where(eq(countries.id, countryId));
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: "UPDATE_COUNTRY_ECONOMIC_SYSTEM",
      targetType: "COUNTRY",
      targetId: country.id,
      beforeSummary: { economicSystem: country.economicSystem },
      afterSummary: { economicSystem },
      reason: "국가 운영 유형 변경",
    });
  });
  revalidatePath(`/admin/countries/${countryId}`);
  revalidatePath("/submissions");
}

export async function applyForCountryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  if (session.user.role === "ADMIN" || session.user.role === "MODERATOR") {
    return { error: "운영진 계정은 국가를 신청할 수 없습니다." };
  }
  const input = applicationSchema.safeParse({
    countryId: formData.get("countryId") || null,
    kind: formData.get("kind") ?? "ASSIGN",
    reason: formData.get("reason") ?? "",
  });
  if (!input.success) return { error: "신청 내용을 확인해 주세요." };

  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return { error: "활성 캠페인이 없습니다." };

  const kind = input.data.kind;
  if (kind === "ASSIGN" && context.assignment) {
    return { error: "이미 국가를 배정받았습니다. 국가 이적을 신청해 주세요." };
  }
  if (kind !== "ASSIGN" && !context.assignment) {
    return { error: "배정된 국가가 없습니다." };
  }

  const pending = await db.query.countryApplications.findFirst({
    where: and(
      eq(countryApplications.campaignId, context.campaign.id),
      eq(countryApplications.userId, session.user.id),
      eq(countryApplications.status, "PENDING"),
    ),
  });
  if (pending) return { error: "이미 검토 중인 신청이 있습니다." };

  let requestedCountryName = context.country?.name ?? "국가 반납";
  if (kind !== "RELEASE") {
    if (!input.data.countryId) return { error: "지도에서 국가를 선택해 주세요." };
    if (input.data.countryId === context.assignment?.countryId) {
      return { error: "이미 담당 중인 국가입니다." };
    }
    const target = await db.query.countries.findFirst({
      where: and(
        eq(countries.campaignId, context.campaign.id),
        eq(countries.id, input.data.countryId),
      ),
    });
    if (!target) return { error: "국가를 찾을 수 없습니다." };
    if (target.isAi) return { error: "AI 국가는 신청할 수 없습니다." };
    const owner = await db.query.countryAssignments.findFirst({
      where: and(
        eq(countryAssignments.countryId, target.id),
        eq(countryAssignments.isActive, true),
        isNull(countryAssignments.endTurnId),
      ),
    });
    if (owner) return { error: "이미 다른 사용자가 담당 중인 국가입니다." };
    requestedCountryName = target.name;
  }

  await db.insert(countryApplications).values({
    campaignId: context.campaign.id,
    userId: session.user.id,
    requestedCountryName,
    requestedCountryId: kind === "RELEASE" ? null : input.data.countryId,
    kind,
    reason: input.data.reason || "지도에서 국가 선택",
  });
  revalidatePath("/apply");
  revalidatePath("/admin/users");
  return {
    success:
      kind === "RELEASE"
        ? "국가 반납 신청을 접수했습니다. 관리자 승인 후 처리됩니다."
        : "국가 신청을 접수했습니다. 관리자 승인 후 배정됩니다.",
  };
}

const assignSchema = z.object({
  applicationId: z.string().uuid(),
  countryId: z.string().uuid().nullable(),
});

export async function assignCountryAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = assignSchema.parse({
    applicationId: formData.get("applicationId"),
    countryId: formData.get("countryId") || null,
  });
  const application = await db.query.countryApplications.findFirst({
    where: and(
      eq(countryApplications.id, input.applicationId),
      eq(countryApplications.status, "PENDING"),
    ),
  });
  if (!application) throw new Error("검토 가능한 신청을 찾을 수 없습니다.");
  const releasing = application.kind === "RELEASE";
  const targetCountryId = releasing ? null : (input.countryId ?? application.requestedCountryId);
  if (!releasing && !targetCountryId) throw new Error("배정할 국가를 선택해 주세요.");

  const context = await getViewerContext(session.user.id);

  await db.transaction(async (tx) => {
    const existing = await tx.query.countryAssignments.findFirst({
      where: and(
        eq(countryAssignments.campaignId, application.campaignId),
        eq(countryAssignments.userId, application.userId),
        eq(countryAssignments.isActive, true),
        isNull(countryAssignments.endTurnId),
      ),
    });
    if (releasing && !existing) throw new Error("반납할 국가 배정이 없습니다.");

    // 이적·반납이면 기존 배정을 먼저 정리한다.
    if (existing) {
      await tx
        .update(countryAssignments)
        .set({ isActive: false, endTurnId: context.turn?.id, updatedAt: new Date() })
        .where(eq(countryAssignments.id, existing.id));
      const previousChannel = await tx.query.chatChannels.findFirst({
        where: and(
          eq(chatChannels.campaignId, application.campaignId),
          eq(chatChannels.countryId, existing.countryId),
        ),
      });
      if (previousChannel) {
        await tx
          .delete(chatChannelMembers)
          .where(
            and(
              eq(chatChannelMembers.channelId, previousChannel.id),
              eq(chatChannelMembers.userId, application.userId),
            ),
          );
      }
    }

    if (targetCountryId) {
      const countryOwner = await tx.query.countryAssignments.findFirst({
        where: and(
          eq(countryAssignments.countryId, targetCountryId),
          eq(countryAssignments.isActive, true),
          isNull(countryAssignments.endTurnId),
        ),
      });
      if (countryOwner) throw new Error("이미 다른 사용자에게 배정된 국가입니다.");
      await tx.insert(countryAssignments).values({
        campaignId: application.campaignId,
        countryId: targetCountryId,
        userId: application.userId,
      });
      const countryChannel = await tx.query.chatChannels.findFirst({
        where: and(
          eq(chatChannels.campaignId, application.campaignId),
          eq(chatChannels.countryId, targetCountryId),
        ),
      });
      if (countryChannel) {
        await tx
          .insert(chatChannelMembers)
          .values({ channelId: countryChannel.id, userId: application.userId })
          .onConflictDoNothing();
      }
    }

    const nextRole = targetCountryId ? "PLAYER" : "USER";
    await tx
      .update(countryApplications)
      .set({
        status: "APPROVED",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(countryApplications.id, application.id));
    await tx
      .update(campaignMemberships)
      .set({ role: nextRole, updatedAt: new Date() })
      .where(
        and(
          eq(campaignMemberships.campaignId, application.campaignId),
          eq(campaignMemberships.userId, application.userId),
        ),
      );
    await tx
      .update(users)
      .set({ role: nextRole, updatedAt: new Date() })
      .where(eq(users.id, application.userId));
    await tx.insert(auditLogs).values({
      campaignId: application.campaignId,
      actorId: session.user.id,
      action: releasing ? "RELEASE_COUNTRY_ASSIGNMENT" : "ASSIGN_COUNTRY",
      targetType: "COUNTRY_ASSIGNMENT",
      targetId: targetCountryId ?? existing?.countryId ?? application.userId,
      beforeSummary: existing ? { countryId: existing.countryId } : undefined,
      afterSummary: { userId: application.userId, countryId: targetCountryId },
      reason: `국가 ${application.kind === "TRANSFER" ? "이적" : releasing ? "반납" : "배정"} 신청 승인`,
    });
  });
  revalidatePath("/admin/countries");
  revalidatePath("/admin/users");
}

export async function rejectCountryApplicationAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = z
    .object({ applicationId: z.string().uuid(), reviewNote: z.string().trim().max(300) })
    .parse({
      applicationId: formData.get("applicationId"),
      reviewNote: formData.get("reviewNote") ?? "",
    });
  const application = await db.query.countryApplications.findFirst({
    where: and(
      eq(countryApplications.id, input.applicationId),
      eq(countryApplications.status, "PENDING"),
    ),
  });
  if (!application) throw new Error("검토 가능한 신청을 찾을 수 없습니다.");
  await db.transaction(async (tx) => {
    await tx
      .update(countryApplications)
      .set({
        status: "REJECTED",
        reviewedBy: session.user.id,
        reviewNote: input.reviewNote || null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(countryApplications.id, application.id));
    await tx.insert(auditLogs).values({
      campaignId: application.campaignId,
      actorId: session.user.id,
      action: "REJECT_COUNTRY_APPLICATION",
      targetType: "COUNTRY_APPLICATION",
      targetId: application.id,
      beforeSummary: { status: "PENDING", kind: application.kind },
      afterSummary: { status: "REJECTED" },
      reason: input.reviewNote || "국가 신청 반려",
    });
  });
  revalidatePath("/admin/users");
  revalidatePath("/apply");
}

export async function submitCountrySetupAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("PLAYER");
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.assignment) return { error: "배정된 국가가 없습니다." };
  if (context.country.setupStatus === "APPROVED")
    return { error: "이미 승인된 국가는 빠른 설정을 수정할 수 없습니다." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = quickCountrySetupSchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };

  await db.transaction(async (tx) => {
    await tx.insert(countrySetupSubmissions).values({
      countryId: context.country!.id,
      submittedBy: session.user.id,
      status: "SUBMITTED",
      quickSetup: parsed.data,
    });
    await tx
      .update(countries)
      .set({ setupStatus: "SUBMITTED", updatedAt: new Date() })
      .where(eq(countries.id, context.country!.id));
  });
  revalidatePath("/country/setup");
  revalidatePath("/admin/countries");
  return { success: "빠른 국가 설정을 관리자에게 제출했습니다." };
}

const reviewSetupSchema = z.object({
  submissionId: z.string().uuid(),
  reviewComment: z.string().trim().max(1000).optional(),
});

export async function approveCountrySetupAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = reviewSetupSchema.parse({
    submissionId: formData.get("submissionId"),
    reviewComment: formData.get("reviewComment") || undefined,
  });
  const submission = await db.query.countrySetupSubmissions.findFirst({
    where: and(
      eq(countrySetupSubmissions.id, input.submissionId),
      eq(countrySetupSubmissions.status, "SUBMITTED"),
    ),
  });
  if (!submission) throw new Error("검토 가능한 설정을 찾을 수 없습니다.");
  const setup = quickCountrySetupSchema.parse(submission.quickSetup);
  const campaign = await getActiveCampaign();
  if (!campaign) throw new Error("활성 캠페인이 없습니다.");
  const baselineTurn = await db.query.turns.findFirst({
    where: eq(turns.campaignId, campaign.id),
    orderBy: [desc(turns.sequence)],
  });
  if (!baselineTurn) throw new Error("초기 스냅샷을 연결할 턴이 없습니다.");
  const derived = deriveCountrySetup(setup);

  await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(countryProfileRevisions)
      .values({
        countryId: submission.countryId,
        revision: 1,
        status: "APPROVED",
        flag: setup.flag,
        capital: setup.capital,
        governmentForm: setup.governmentForm,
        totalAreaKm2: setup.totalAreaKm2,
        officialCurrency: setup.currencyCode,
        currencyCode: setup.currencyCode,
        majorIndustries: setup.majorIndustries
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        approvedBy: session.user.id,
        approvedAt: new Date(),
      })
      .returning();
    await tx
      .update(countries)
      .set({
        name: setup.countryName,
        setupStatus: "APPROVED",
        currentProfileRevisionId: profile.id,
        updatedAt: new Date(),
      })
      .where(eq(countries.id, submission.countryId));
    await tx.insert(countryOffices).values({
      countryId: submission.countryId,
      officeType: "HEAD_OF_STATE",
      holderName: setup.headOfState,
      startTurnId: baselineTurn.id,
    });
    const officeRows = await tx
      .insert(governmentOfficeDefinitions)
      .values([
        {
          countryId: submission.countryId,
          branch: "EXECUTIVE",
          title: "국가원수",
          seatCount: 1,
          displayOrder: 10,
        },
        {
          countryId: submission.countryId,
          branch: "EXECUTIVE",
          title: "행정부 수반",
          seatCount: 1,
          displayOrder: 20,
        },
        {
          countryId: submission.countryId,
          branch: "JUDICIAL",
          title: "최고재판관",
          seatCount: 1,
          displayOrder: 10,
        },
        {
          countryId: submission.countryId,
          branch: "LEGISLATIVE",
          title: "의회 의장",
          seatCount: 1,
          displayOrder: 10,
        },
      ])
      .returning();
    const officeHolderNames: Record<string, string> = {
      국가원수: setup.headOfState,
      "행정부 수반": "내각 조정관",
      최고재판관: "최고재판관",
      "의회 의장": "의회 의장",
    };
    await tx.insert(governmentOfficeHolders).values(
      officeRows.map((office) => ({
        officeId: office.id,
        slotNumber: 1,
        holderName: officeHolderNames[office.title],
        startTurnId: baselineTurn.id,
      })),
    );
    await tx.insert(demographicSnapshots).values({
      countryId: submission.countryId,
      turnId: baselineTurn.id,
      population: setup.population,
      fertilityRate: "1.8",
      populationGrowthRate: "0.005",
      lifeExpectancy: "78",
      medianAge: "39",
      populationDensity: derived.populationDensity,
      estimatedFields: ["fertilityRate", "populationGrowthRate", "lifeExpectancy", "medianAge"],
    });
    const realGdp = new Decimal(setup.realGdp);
    const nominalGdp = realGdp.mul("1.02");
    const spending = nominalGdp.mul("0.22");
    const revenue = nominalGdp.mul("0.20");
    const debt = nominalGdp.mul("0.48");
    await tx.insert(economicSnapshots).values({
      countryId: submission.countryId,
      turnId: baselineTurn.id,
      realGdp: realGdp.toFixed(4),
      nominalGdp: nominalGdp.toFixed(4),
      realGdpGrowth: "0.025",
      gdpDeflator: "1.02",
      realGni: realGdp.mul("1.01").toFixed(4),
      realGnp: realGdp.mul("1.005").toFixed(4),
      wealth: realGdp.mul("4.2").toFixed(4),
      foreignReserves: realGdp.mul("0.18").toFixed(4),
      currencyCode: ECONOMY_STATISTICS_CURRENCY,
      currencyValue: setup.currencyValue,
      creditRating: "BBB",
      creditScore: 65,
      incomeGini: "0.34",
      wealthGini: "0.58",
      inflationRate: "0.025",
      landPriceGrowth: "0.03",
      unemploymentRate: "0.055",
      governmentRevenue: revenue.toFixed(4),
      governmentSpending: spending.toFixed(4),
      governmentSpendingGrowth: "0.02",
      fiscalBalance: revenue.minus(spending).toFixed(4),
      nationalDebt: debt.toFixed(4),
      debtToGdp: debt.div(nominalGdp).toString(),
      policyRate: "0.03",
      currentAccountToGdp: "0.01",
      productivityIndex: "100",
      povertyRate: "0.12",
      agriculturalProductivityIndex: "100",
      foodSelfSufficiency: "0.8",
      industrialCapitalStockIndex: "100",
      researchCapacityIndex: "100",
      referenceYear: new Date(baselineTurn.gameDateEnd).getUTCFullYear(),
      priceBasis: "constant",
      rulesVersion: campaign.rulesVersion,
    });
    await tx.insert(economicSectors).values(
      standardEconomicSectorRows().map((sector) => ({
        countryId: submission.countryId,
        turnId: baselineTurn.id,
        ...sector,
      })),
    );
    await tx.insert(politicalSnapshots).values({
      countryId: submission.countryId,
      turnId: baselineTurn.id,
      governmentForm: setup.governmentForm,
      headOfState: setup.headOfState,
      rulingParty: "집권 연합",
      oppositionParty: "개혁 야권",
      stability: 60,
      legitimacy: 60,
      governmentApproval: 55,
      unrest: 25,
      stateCapacity: 58,
      corruption: 35,
      democracy: 60,
      politicalPower: "100",
    });
    await tx.insert(countryPoliticalResources).values({
      countryId: submission.countryId,
      balance: "100",
      incomePerGameDay: "0.1",
    });
    await tx
      .update(countrySetupSubmissions)
      .set({
        status: "APPROVED",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        reviewComment: input.reviewComment,
        approvedProfileRevisionId: profile.id,
        updatedAt: new Date(),
      })
      .where(eq(countrySetupSubmissions.id, submission.id));
    await tx.insert(auditLogs).values({
      campaignId: campaign.id,
      actorId: session.user.id,
      action: "APPROVE_COUNTRY_SETUP",
      targetType: "COUNTRY",
      targetId: submission.countryId,
      afterSummary: { profileRevisionId: profile.id, baselineTurnId: baselineTurn.id },
      reason: input.reviewComment || "초기 국가 설정 승인",
    });
  });
  revalidatePath("/admin/countries");
  revalidatePath("/dashboard");
}

export async function requestCountrySetupChangesAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = reviewSetupSchema.parse({
    submissionId: formData.get("submissionId"),
    reviewComment: formData.get("reviewComment") || undefined,
  });
  if (!input.reviewComment) throw new Error("수정 요청 사유를 입력해 주세요.");
  const submission = await db.query.countrySetupSubmissions.findFirst({
    where: eq(countrySetupSubmissions.id, input.submissionId),
  });
  if (!submission || submission.status !== "SUBMITTED")
    throw new Error("검토 가능한 설정이 아닙니다.");
  await db.transaction(async (tx) => {
    await tx
      .update(countrySetupSubmissions)
      .set({
        status: "CHANGES_REQUESTED",
        reviewComment: input.reviewComment,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(countrySetupSubmissions.id, submission.id));
    await tx
      .update(countries)
      .set({ setupStatus: "CHANGES_REQUESTED", updatedAt: new Date() })
      .where(eq(countries.id, submission.countryId));
  });
  revalidatePath("/admin/countries");
}

export async function deleteCountryAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const countryId = z.string().uuid().parse(formData.get("countryId"));
  const country = await deleteCountryFully({
    countryId,
    actorId: session.user.id,
    reason: "관리자 국가 삭제",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/countries");
  revalidatePath("/admin/users");
  revalidatePath("/admin/economy");
  revalidatePath("/admin/politics");
  revalidatePath("/admin/map");
  revalidatePath(`/admin/countries/${country.id}`);
  redirect("/admin/countries");
}
