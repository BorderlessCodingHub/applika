import { liveCopy } from "@/i18n/translator";

/**
 * On-screen words for closing (finalizing) and reopening an application, in
 * the active language (`applications.close*`). Exported because the tests and
 * the e2e suite assert on them; do not paraphrase them at the call site. The
 * components rendering them subscribe (`useLocale`), so a switch re-renders
 * them. Never spread a copy object: it would freeze the words.
 */

/** The outcome picked when closing. `none` closes with no timeline event. */
type FinalizeOutcome = "none" | "offer" | "denied";

/**
 * The closed badge, the row actions, and the confirmation that closing can be
 * undone (`reversible` must say "reversible").
 */
export const APPLICATION_CLOSE_COPY = liveCopy("applications.close", [
  "reversible",
  "closed",
  "closeAction",
  "reopenAction",
]);

/**
 * The close dialog's own words (`TimelineEventForm purpose="close"`): its
 * title, the label of its None/Offer/Denied chips, and its buttons.
 * `description` is the same sentence as `APPLICATION_CLOSE_COPY.reversible`.
 */
export const FINALIZE_DIALOG_COPY = liveCopy("applications.closeDialog", [
  "title",
  "description",
  "outcomeLabel",
  "submit",
  "cancel",
]);

/**
 * Label and one-line explanation per outcome: the close dialog's chips and
 * the line under them (`CLOSE_TYPE_OPTIONS`).
 */
export const FINALIZE_OUTCOME_COPY: Readonly<
  Record<FinalizeOutcome, Readonly<{ label: string; description: string }>>
> = {
  none: liveCopy("applications.closeOutcome.none", ["label", "description"]),
  offer: liveCopy("applications.closeOutcome.offer", ["label", "description"]),
  denied: liveCopy("applications.closeOutcome.denied", [
    "label",
    "description",
  ]),
};
