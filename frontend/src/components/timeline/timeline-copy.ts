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

/** Label of the denied reason select, and the badge's screen-reader prefix. */
export const DENIED_REASON_FIELD_LABEL = "Reason";

/** The interview-only schedule group of the event form. */
export const SCHEDULE_COPY = {
  legend: "Schedule (optional)",
  hint: "Add a time range to place this interview on your agenda.",
} as const;

/** The timezone select's words. */
export const TIMEZONE_COPY = {
  label: "Timezone",
  placeholder: "Select timezone",
  search: "Search city, region or offset",
  empty: "No timezone found.",
  /** Group of a stored zone the browser does not list (e.g. `Etc/UTC`). */
  selectedGroup: "Selected",
  /** Group of zones without a region, e.g. `UTC`. */
  otherGroup: "Other",
} as const;
