import { liveCopy } from "@/i18n/translator";

/**
 * On-screen words of the timeline, in the active language (`timeline.*`).
 * Exported because the tests and the e2e suite assert on them; do not
 * paraphrase them at the call site. The components rendering them subscribe
 * (`useLocale`), so a switch re-renders them. Never spread a copy object: it
 * would freeze the words.
 */

/** Why a timeline is read-only. The application is the authority. */
export type TimelineReadOnlyReason = "closed" | "archived";

/** The notice `TimelinePanel` shows above a read-only timeline, per reason. */
export const TIMELINE_READ_ONLY_COPY: Readonly<
  Record<TimelineReadOnlyReason, string>
> = liveCopy("timeline.readOnly", ["closed", "archived"]);

/**
 * Single lines of the event form and card:
 * - `initialScreeningTaken`: under the interview type select while
 *   `initial_screening` is taken;
 * - `interviewTypeTaken`: suffix on a disabled interview type option;
 * - `legacyHourlyOffer`: under the salary period toggle when an offer is
 *   loaded with the legacy `hourly` period (no selection; the user picks one);
 * - `deniedReasonLabel`: the denied reason select's label, and the badge's
 *   screen-reader prefix;
 * - `deniedFeedbackPrefix`: a denied card's title reads
 *   `Feedback: <reason label>`.
 */
export const TIMELINE_COPY = liveCopy("timeline.copy", [
  "initialScreeningTaken",
  "interviewTypeTaken",
  "legacyHourlyOffer",
  "deniedReasonLabel",
  "deniedFeedbackPrefix",
]);

/** The interview-only schedule group of the event form. */
export const SCHEDULE_COPY = liveCopy("timeline.schedule", ["legend", "hint"]);

/**
 * The timezone select's words. `selectedGroup` heads a stored zone the
 * browser does not list (e.g. `Etc/UTC`); `otherGroup` heads zones without a
 * region (e.g. `UTC`).
 */
export const TIMEZONE_COPY = liveCopy("timeline.timezone", [
  "label",
  "placeholder",
  "search",
  "empty",
  "selectedGroup",
  "otherGroup",
]);

/** The timeline panel's header words (KODI-015 reference image). */
export const TIMELINE_PANEL_COPY = liveCopy("timeline.panel", [
  "title",
  "description",
  "addEvent",
]);

/** Items of an event card's kebab menu. */
export const TIMELINE_EVENT_ACTION_COPY = liveCopy("timeline.eventActions", [
  "edit",
  "delete",
]);
