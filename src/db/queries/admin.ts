import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import {
  adminChangeProposals,
  countries,
  countryApplications,
  countryAssignments,
  countrySetupSubmissions,
  events,
  jobs,
  judgmentProposals,
  oppositionActions,
  simulationRules,
  submissions,
  users,
} from "@/src/db/schema";

export async function getAdminOverview(campaignId: string) {
  const [applications, setupSubmissions, pendingChanges, countryRows] = await Promise.all([
    db
      .select({ application: countryApplications, user: users })
      .from(countryApplications)
      .innerJoin(users, eq(countryApplications.userId, users.id))
      .where(
        and(
          eq(countryApplications.campaignId, campaignId),
          eq(countryApplications.status, "PENDING"),
        ),
      )
      .orderBy(asc(countryApplications.createdAt)),
    db
      .select({ submission: countrySetupSubmissions, country: countries, user: users })
      .from(countrySetupSubmissions)
      .innerJoin(countries, eq(countrySetupSubmissions.countryId, countries.id))
      .innerJoin(users, eq(countrySetupSubmissions.submittedBy, users.id))
      .where(eq(countrySetupSubmissions.status, "SUBMITTED"))
      .orderBy(asc(countrySetupSubmissions.createdAt)),
    db
      .select({ change: adminChangeProposals, country: countries })
      .from(adminChangeProposals)
      .innerJoin(countries, eq(adminChangeProposals.countryId, countries.id))
      .where(eq(adminChangeProposals.status, "PENDING"))
      .orderBy(desc(adminChangeProposals.createdAt)),
    db.query.countries.findMany({
      where: eq(countries.campaignId, campaignId),
      orderBy: [asc(countries.name)],
    }),
  ]);
  return { applications, setupSubmissions, pendingChanges, countries: countryRows };
}

export async function getActiveAssignments(campaignId: string) {
  return db.query.countryAssignments.findMany({
    where: and(
      eq(countryAssignments.campaignId, campaignId),
      eq(countryAssignments.isActive, true),
    ),
  });
}

export async function getActiveEconomyRule(campaignId: string) {
  return db.query.simulationRules.findFirst({
    where: and(eq(simulationRules.campaignId, campaignId), eq(simulationRules.isActive, true)),
    orderBy: [desc(simulationRules.createdAt)],
  });
}

export async function getTurnOperationalState(turnId: string) {
  const [jobRows, submissionRows, judgmentRows, eventRows, oppositionRows] = await Promise.all([
    db.query.jobs.findMany({ where: eq(jobs.turnId, turnId) }),
    db.query.submissions.findMany({ where: eq(submissions.turnId, turnId) }),
    db.query.judgmentProposals.findMany({ where: eq(judgmentProposals.turnId, turnId) }),
    db.query.events.findMany({ where: eq(events.startTurnId, turnId) }),
    db.query.oppositionActions.findMany({ where: eq(oppositionActions.turnId, turnId) }),
  ]);
  return {
    jobs: jobRows,
    submissions: submissionRows,
    judgments: judgmentRows,
    events: eventRows,
    opposition: oppositionRows,
    queuedJobs: jobRows.filter((job) => job.status === "QUEUED" || job.status === "RUNNING").length,
    failedJobs: jobRows.filter((job) => job.status === "FAILED").length,
    pendingJudgments: judgmentRows.filter(
      (proposal) => proposal.status === "PENDING" && proposal.submissionId,
    ).length,
    pendingEvents:
      eventRows.filter((event) => event.status === "REVIEW").length +
      oppositionRows.filter((action) => action.status === "PENDING_REVIEW").length,
  };
}
