import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import {
  countries,
  effectProposals,
  judgmentProposals,
  policyGoals,
  reviewComments,
  submissions,
  submissionVersions,
  users,
} from "@/src/db/schema";

export async function getCountryPolicyGoals(countryId: string) {
  return db.query.policyGoals.findMany({
    where: eq(policyGoals.countryId, countryId),
    orderBy: [desc(policyGoals.createdAt)],
  });
}

export async function getCountrySubmissions(countryId: string) {
  const rows = await db.query.submissions.findMany({
    where: eq(submissions.countryId, countryId),
    orderBy: [desc(submissions.updatedAt)],
  });
  return Promise.all(
    rows.map(async (submission) => {
      const [versions, comments, proposal, policyGoal] = await Promise.all([
        db.query.submissionVersions.findMany({
          where: eq(submissionVersions.submissionId, submission.id),
          orderBy: [desc(submissionVersions.version)],
        }),
        db
          .select({ comment: reviewComments, author: users })
          .from(reviewComments)
          .innerJoin(users, eq(reviewComments.authorId, users.id))
          .where(eq(reviewComments.submissionId, submission.id))
          .orderBy(asc(reviewComments.createdAt)),
        db.query.judgmentProposals.findFirst({
          where: eq(judgmentProposals.submissionId, submission.id),
          orderBy: [desc(judgmentProposals.createdAt)],
        }),
        submission.policyGoalId
          ? db.query.policyGoals.findFirst({
              where: eq(policyGoals.id, submission.policyGoalId),
            })
          : null,
      ]);
      const effects = proposal
        ? await db.query.effectProposals.findMany({
            where: eq(effectProposals.judgmentProposalId, proposal.id),
          })
        : [];
      return {
        submission,
        versions,
        comments,
        proposal: proposal ?? null,
        policyGoal: policyGoal ?? null,
        effects,
      };
    }),
  );
}

export async function getAdminSubmissionQueue(campaignId: string) {
  const rows = await db
    .select({ submission: submissions, country: countries, user: users })
    .from(submissions)
    .innerJoin(countries, eq(submissions.countryId, countries.id))
    .innerJoin(users, eq(submissions.userId, users.id))
    .where(
      and(
        eq(submissions.campaignId, campaignId),
        inArray(submissions.status, [
          "SUBMITTED",
          "LOCKED",
          "JUDGING",
          "NEEDS_INFO",
          "APPROVED",
          "REJECTED",
        ]),
      ),
    )
    .orderBy(asc(submissions.createdAt));
  return Promise.all(
    rows.map(async (row) => {
      const proposal = await db.query.judgmentProposals.findFirst({
        where: eq(judgmentProposals.submissionId, row.submission.id),
        orderBy: [desc(judgmentProposals.createdAt)],
      });
      const effects = proposal
        ? await db.query.effectProposals.findMany({
            where: eq(effectProposals.judgmentProposalId, proposal.id),
          })
        : [];
      return { ...row, proposal: proposal ?? null, effects };
    }),
  );
}
