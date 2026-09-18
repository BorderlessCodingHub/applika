/**
 * On-screen words of the timeline. Exported because the tests and the e2e suite
 * assert on them; do not paraphrase them at the call site.
 */

/** Why a timeline is read-only. The application is the authority. */
export type TimelineReadOnlyReason = "closed" | "archived";

/** The notice `TimelinePanel` shows above a read-only timeline, per reason. */
export const TIMELINE_READ_ONLY_COPY: Record<TimelineReadOnlyReason, string> = {
  closed: "This application is closed. Reopen it to add or edit events.",
  archived:
    "Applications from a past cycle are archived. This timeline can no longer be changed.",
};

/** Shown under the interview type select while `initial_screening` is taken. */
export const INITIAL_SCREENING_TAKEN_HINT =
  "This application already has an initial screening. An application can have only one.";

/** Suffix on a disabled interview type option in the open select. */
export const INTERVIEW_TYPE_TAKEN_LABEL = "Already recorded";

/**
 * Shown under the salary period toggle when an offer is loaded with the legacy
 * `hourly` period: the toggle then has no selection and the user must pick one.
 */
export const LEGACY_HOURLY_OFFER_HINT =
  "This offer was recorded per hour. Choose monthly or annually to save it.";
