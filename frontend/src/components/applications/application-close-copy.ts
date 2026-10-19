/**
 * On-screen words for closing (finalizing) and reopening an application.
 * Exported because the tests and the e2e suite assert on them; do not paraphrase
 * them at the call site.
 */

/** The outcome picked when closing. `none` closes with no timeline event. */
type FinalizeOutcome = "none" | "offer" | "denied";

/** The confirmation that closing can be undone. Must say "reversible". */
export const FINALIZE_REVERSIBLE_COPY =
  "Closing is reversible: nothing is deleted and you can reopen this application at any time.";

/**
 * The close dialog's own words (`TimelineEventForm purpose="close"`): its
 * title, the label of its None/Offer/Denied chips, and its buttons.
 */
export const FINALIZE_DIALOG_COPY = {
  title: "Close application",
  description: FINALIZE_REVERSIBLE_COPY,
  outcomeLabel: "Outcome",
  submit: "Close application",
  cancel: "Cancel",
} as const;

/**
 * Label and one-line explanation per outcome: the close dialog's chips and
 * the line under them (`CLOSE_TYPE_OPTIONS`).
 */
export const FINALIZE_OUTCOME_COPY: Record<
  FinalizeOutcome,
  { label: string; description: string }
> = {
  none: {
    label: "None",
    description: "Close without an outcome. Nothing is added to the timeline.",
  },
  offer: {
    label: "Offer",
    description:
      "Close with an offer. An offer event with its salary is added to the timeline.",
  },
  denied: {
    label: "Denied",
    description:
      "Close with a rejection. A denied event is added to the timeline.",
  },
};

/** The closed badge's word. */
export const APPLICATION_CLOSED_LABEL = "Closed";

/** The row action that closes an open application (opens the dialog). */
export const CLOSE_ACTION_LABEL = "Close";

/** The row action that reopens a closed application. */
export const REOPEN_ACTION_LABEL = "Reopen";
