import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["USER", "PLAYER", "MODERATOR", "ADMIN"]);
export const userStatus = pgEnum("user_status", ["ACTIVE", "SUSPENDED"]);
export const membershipStatus = pgEnum("membership_status", ["ACTIVE", "INACTIVE"]);
export const gameTimeUnit = pgEnum("game_time_unit", ["DAY", "MONTH", "YEAR"]);
export const turnStatus = pgEnum("turn_status", [
  "DRAFT",
  "LOCKED",
  "CALCULATING",
  "AI_RUNNING",
  "REVIEW",
  "PUBLISHED",
  "FAILED",
]);
export const applicationStatus = pgEnum("application_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);
export const setupStatus = pgEnum("setup_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "CHANGES_REQUESTED",
]);
export const profileRevisionStatus = pgEnum("profile_revision_status", [
  "DRAFT",
  "APPROVED",
  "SUPERSEDED",
]);
export const researchStatus = pgEnum("research_status", [
  "LOCKED",
  "AVAILABLE",
  "IN_PROGRESS",
  "COMPLETED",
]);
export const changeProposalStatus = pgEnum("change_proposal_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const changeDomain = pgEnum("change_domain", ["ECONOMY", "POLITICS"]);

export const submissionStatus = pgEnum("submission_status", [
  "DRAFT",
  "SUBMITTED",
  "LOCKED",
  "JUDGING",
  "NEEDS_INFO",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
]);
export const submissionCategory = pgEnum("submission_category", [
  "ECONOMY",
  "POLITICS",
  "DIPLOMACY",
  "INTELLIGENCE",
  "RESEARCH",
  "SOCIETY",
  "OTHER",
]);
export const jobType = pgEnum("job_type", [
  "CALCULATE_COUNTRY_ECONOMY",
  "CALCULATE_COUNTRY_RESEARCH",
  "JUDGE_SUBMISSION",
  "GENERATE_OPPOSITION_ACTION",
  "GENERATE_AI_DIPLOMACY_RESPONSE",
  "GENERATE_TURN_EVENT",
  "FINALIZE_TURN_REVIEW_DATA",
]);
export const jobStatus = pgEnum("job_status", ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]);
export const judgmentRunStatus = pgEnum("judgment_run_status", ["RUNNING", "SUCCEEDED", "FAILED"]);
export const judgmentReviewStatus = pgEnum("judgment_review_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_INFO",
]);
export const judgmentVerdict = pgEnum("judgment_verdict", [
  "SUCCESS",
  "PARTIAL",
  "FAILURE",
  "DELAYED",
  "NEEDS_ADMIN",
]);
export const effectStatus = pgEnum("effect_status", [
  "VALID",
  "WARNING",
  "APPROVED",
  "REJECTED",
  "APPLIED",
]);
export const eventVisibility = pgEnum("event_visibility", ["PUBLIC", "COUNTRY", "ADMIN"]);
export const eventStatus = pgEnum("event_status", [
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "RESOLVED",
  "ARCHIVED",
]);
export const oppositionActionStatus = pgEnum("opposition_action_status", [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
]);
export const diplomaticProposalType = pgEnum("diplomatic_proposal_type", [
  "STATEMENT",
  "NEGOTIATION",
  "TREATY",
  "TRADE",
  "AID",
  "WARNING",
  "OTHER",
]);
export const diplomaticProposalStatus = pgEnum("diplomatic_proposal_status", [
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "COUNTERED",
  "DELAYED",
  "PENDING_AI",
  "PENDING_REVIEW",
  "EXPIRED",
]);
export const diplomaticVisibility = pgEnum("diplomatic_visibility", ["PUBLIC", "PRIVATE"]);
export const diplomaticMessageStatus = pgEnum("diplomatic_message_status", [
  "DRAFT",
  "SENT",
  "REJECTED",
]);
export const chatChannelType = pgEnum("chat_channel_type", ["CAMPAIGN", "COUNTRY", "ANNOUNCEMENT"]);
export const moderationActionType = pgEnum("moderation_action_type", [
  "DELETE_MESSAGE",
  "TIMEOUT_USER",
  "CLEAR_TIMEOUT",
  "SUSPEND_USER",
  "ACTIVATE_USER",
]);
