import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  adminChangeProposals,
  administrativeDivisionRequests,
  administrativeDivisions,
  appliedEffects,
  auditLogs,
  chatChannels,
  chatMessages,
  countries,
  companyClassFinancials,
  companyScaleStatistics,
  countryAssignments,
  countryDevelopmentTracks,
  countryFlags,
  countryLawChanges,
  countryLaws,
  countryFiscalPolicies,
  countryOffices,
  countryPoliticalResources,
  countryProfileRevisions,
  countryRelations,
  countryResearch,
  countrySetupSubmissions,
  demographicSnapshots,
  diplomaticBlocMembers,
  diplomaticMessages,
  diplomaticOrientations,
  diplomaticProposals,
  economicBlocMembers,
  economicSectors,
  economicSnapshots,
  effectProposals,
  eventChoices,
  eventOptions,
  events,
  financialInstitutions,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  judgmentProposals,
  majorCompanies,
  mapRasterColorAssignments,
  moderationActions,
  modifiers,
  officePersonnelChanges,
  oppositionActions,
  parties,
  partySnapshots,
  policyGoals,
  politicalPowerLedger,
  worldMechanicActions,
  countrySpirits,
  politicalSnapshots,
  researchAllocations,
  reviewComments,
  submissionVersions,
  submissions,
  superEvents,
  treaties,
  turnCountryWorkspaces,
} from "@/src/db/schema";
import { rebuildAutomaticMapBorders } from "@/src/services/rebuild-automatic-map";

function idsOf<T extends string>(rows: Array<{ id: T }>) {
  return rows.map((row) => row.id);
}

export async function deleteCountryFully(input: {
  countryId: string;
  actorId: string;
  reason?: string;
}) {
  const country = await db.query.countries.findFirst({
    where: eq(countries.id, input.countryId),
  });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");

  const countryId = country.id;
  const reason = input.reason ?? "관리자 국가 삭제";

  await db.transaction(async (tx) => {
    await tx
      .update(countries)
      .set({ currentProfileRevisionId: null, updatedAt: new Date() })
      .where(eq(countries.id, countryId));

    await tx
      .update(superEvents)
      .set({ targetCountryId: null })
      .where(eq(superEvents.targetCountryId, countryId));

    const proposalRows = await tx
      .select({ id: diplomaticProposals.id })
      .from(diplomaticProposals)
      .where(
        or(
          eq(diplomaticProposals.fromCountryId, countryId),
          eq(diplomaticProposals.toCountryId, countryId),
        ),
      );
    const proposalIds = idsOf(proposalRows);
    if (proposalIds.length) {
      await tx
        .delete(diplomaticMessages)
        .where(inArray(diplomaticMessages.proposalId, proposalIds));
      await tx.delete(diplomaticProposals).where(inArray(diplomaticProposals.id, proposalIds));
    }
    await tx.delete(diplomaticMessages).where(eq(diplomaticMessages.senderCountryId, countryId));
    await tx
      .delete(countryRelations)
      .where(
        or(
          eq(countryRelations.fromCountryId, countryId),
          eq(countryRelations.toCountryId, countryId),
        ),
      );
    await tx.delete(diplomaticOrientations).where(eq(diplomaticOrientations.countryId, countryId));
    await tx.delete(diplomaticBlocMembers).where(eq(diplomaticBlocMembers.countryId, countryId));
    await tx.delete(economicBlocMembers).where(eq(economicBlocMembers.countryId, countryId));
    await tx.delete(treaties).where(sql`${countryId} = ANY(${treaties.partyCountryIds})`);

    await tx
      .delete(mapRasterColorAssignments)
      .where(eq(mapRasterColorAssignments.countryId, countryId));
    await tx
      .delete(administrativeDivisionRequests)
      .where(eq(administrativeDivisionRequests.countryId, countryId));
    await tx
      .update(administrativeDivisions)
      .set({ parentId: null })
      .where(eq(administrativeDivisions.countryId, countryId));
    await tx
      .delete(administrativeDivisions)
      .where(eq(administrativeDivisions.countryId, countryId));

    await tx.delete(officePersonnelChanges).where(eq(officePersonnelChanges.countryId, countryId));
    const officeRows = await tx
      .select({ id: governmentOfficeDefinitions.id })
      .from(governmentOfficeDefinitions)
      .where(eq(governmentOfficeDefinitions.countryId, countryId));
    const officeIds = idsOf(officeRows);
    if (officeIds.length) {
      await tx
        .delete(governmentOfficeHolders)
        .where(inArray(governmentOfficeHolders.officeId, officeIds));
      await tx
        .delete(governmentOfficeDefinitions)
        .where(inArray(governmentOfficeDefinitions.id, officeIds));
    }
    await tx.delete(countryOffices).where(eq(countryOffices.countryId, countryId));

    await tx.delete(researchAllocations).where(eq(researchAllocations.countryId, countryId));
    await tx.delete(countryResearch).where(eq(countryResearch.countryId, countryId));

    await tx.delete(modifiers).where(eq(modifiers.countryId, countryId));
    await tx
      .delete(countryDevelopmentTracks)
      .where(eq(countryDevelopmentTracks.countryId, countryId));
    await tx.delete(adminChangeProposals).where(eq(adminChangeProposals.countryId, countryId));
    await tx.delete(countryFiscalPolicies).where(eq(countryFiscalPolicies.countryId, countryId));
    await tx.delete(politicalPowerLedger).where(eq(politicalPowerLedger.countryId, countryId));
    await tx.delete(countryLawChanges).where(eq(countryLawChanges.countryId, countryId));
    await tx.delete(worldMechanicActions).where(eq(worldMechanicActions.countryId, countryId));
    await tx.delete(countrySpirits).where(eq(countrySpirits.countryId, countryId));
    await tx.delete(countryLaws).where(eq(countryLaws.countryId, countryId));
    await tx
      .delete(countryPoliticalResources)
      .where(eq(countryPoliticalResources.countryId, countryId));
    await tx.delete(economicSectors).where(eq(economicSectors.countryId, countryId));
    await tx.delete(financialInstitutions).where(eq(financialInstitutions.countryId, countryId));
    await tx.delete(majorCompanies).where(eq(majorCompanies.countryId, countryId));
    await tx.delete(companyClassFinancials).where(eq(companyClassFinancials.countryId, countryId));
    await tx.delete(companyScaleStatistics).where(eq(companyScaleStatistics.countryId, countryId));
    await tx.delete(demographicSnapshots).where(eq(demographicSnapshots.countryId, countryId));
    await tx.delete(politicalSnapshots).where(eq(politicalSnapshots.countryId, countryId));
    await tx.delete(economicSnapshots).where(eq(economicSnapshots.countryId, countryId));

    await tx.delete(oppositionActions).where(eq(oppositionActions.countryId, countryId));
    const partyRows = await tx
      .select({ id: parties.id })
      .from(parties)
      .where(eq(parties.countryId, countryId));
    const partyIds = idsOf(partyRows);
    if (partyIds.length) {
      await tx.delete(partySnapshots).where(inArray(partySnapshots.partyId, partyIds));
      await tx.delete(parties).where(inArray(parties.id, partyIds));
    }

    await tx.delete(eventChoices).where(eq(eventChoices.countryId, countryId));
    const eventRows = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.countryId, countryId));
    const eventIds = idsOf(eventRows);
    if (eventIds.length) {
      await tx.delete(eventChoices).where(inArray(eventChoices.eventId, eventIds));
      await tx.delete(eventOptions).where(inArray(eventOptions.eventId, eventIds));
      await tx.delete(events).where(inArray(events.id, eventIds));
    }

    const judgmentRows = await tx
      .select({ id: judgmentProposals.id })
      .from(judgmentProposals)
      .where(eq(judgmentProposals.countryId, countryId));
    const judgmentIds = idsOf(judgmentRows);
    if (judgmentIds.length) {
      const effectRows = await tx
        .select({ id: effectProposals.id })
        .from(effectProposals)
        .where(inArray(effectProposals.judgmentProposalId, judgmentIds));
      const effectIds = idsOf(effectRows);
      if (effectIds.length) {
        await tx
          .update(appliedEffects)
          .set({ effectProposalId: null })
          .where(inArray(appliedEffects.effectProposalId, effectIds));
        await tx.delete(effectProposals).where(inArray(effectProposals.id, effectIds));
      }
      await tx.delete(judgmentProposals).where(inArray(judgmentProposals.id, judgmentIds));
    }

    const submissionRows = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.countryId, countryId));
    const submissionIds = idsOf(submissionRows);
    if (submissionIds.length) {
      await tx
        .update(judgmentProposals)
        .set({ submissionId: null })
        .where(inArray(judgmentProposals.submissionId, submissionIds));
      await tx.delete(reviewComments).where(inArray(reviewComments.submissionId, submissionIds));
      await tx
        .delete(submissionVersions)
        .where(inArray(submissionVersions.submissionId, submissionIds));
      await tx.delete(submissions).where(inArray(submissions.id, submissionIds));
    }

    await tx.delete(policyGoals).where(eq(policyGoals.countryId, countryId));
    await tx.delete(turnCountryWorkspaces).where(eq(turnCountryWorkspaces.countryId, countryId));

    const channelRows = await tx
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(eq(chatChannels.countryId, countryId));
    const channelIds = idsOf(channelRows);
    if (channelIds.length) {
      const messageRows = await tx
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(inArray(chatMessages.channelId, channelIds));
      const messageIds = idsOf(messageRows);
      if (messageIds.length) {
        await tx.delete(moderationActions).where(inArray(moderationActions.messageId, messageIds));
        await tx
          .update(chatMessages)
          .set({ replyToId: null })
          .where(inArray(chatMessages.id, messageIds));
        await tx.delete(chatMessages).where(inArray(chatMessages.id, messageIds));
      }
      await tx.delete(chatChannels).where(inArray(chatChannels.id, channelIds));
    }

    await tx.delete(countryAssignments).where(eq(countryAssignments.countryId, countryId));
    await tx
      .delete(countrySetupSubmissions)
      .where(eq(countrySetupSubmissions.countryId, countryId));
    await tx.delete(countryFlags).where(eq(countryFlags.countryId, countryId));
    await tx
      .delete(countryProfileRevisions)
      .where(eq(countryProfileRevisions.countryId, countryId));

    await tx.delete(countries).where(and(eq(countries.id, countryId)));

    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: input.actorId,
      action: "DELETE_COUNTRY",
      targetType: "COUNTRY",
      targetId: countryId,
      beforeSummary: {
        name: country.name,
        code: country.code,
        isAi: country.isAi,
        setupStatus: country.setupStatus,
      },
      reason,
    });
  });

  await rebuildAutomaticMapBorders(country.campaignId, input.actorId);
  return country;
}
