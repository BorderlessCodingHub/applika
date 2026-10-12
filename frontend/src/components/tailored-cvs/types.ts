/**
 * Presentation-layer shapes for the tailored CV — the per-application COPY of a
 * master CV.
 *
 * The vocabulary is `base-cvs/types.ts`: a tailored CV carries the same fields
 * as a master CV (`CvScalars` + `CvSections`), so the same editor fields, the
 * same schema shape and the same document renderer work unchanged. This module
 * only adds what is specific to a copy — which application it belongs to, which
 * master CV it came from (or `null`, once that master CV is deleted) and the two
 * provenance fields the API always returns.
 */

import type { CvScalars, CvSections } from "@/components/base-cvs/types";

/**
 * The master CV's content, captured once at copy-creation time (KODI-017,
 * R5). Exactly the copy's own content fields — same shape, same item ids — so
 * `cv-diff.ts` can compare it against the form values directly. `null` on a
 * copy created before this field existed (no backfill) and on every copy
 * forever after: it is written once and never rewritten, not by a PUT, not by
 * editing or deleting the master CV.
 */
export type TailoredCvSnapshot = CvScalars & CvSections;

/**
 * One section the keyword tailoring reordered (ADR-0017), written once at
 * creation. `section` is a `CvFormSectionId` today (`skills`, `experience`);
 * `description` is the server's sentence, shown verbatim.
 */
export interface TailoredCvAdjustment {
  section: string;
  description: string;
}

/** A persisted CV copy as returned by the API. */
export interface TailoredCv extends CvScalars, CvSections {
  id: string;
  /** The application this copy belongs to. One copy per application. */
  application_id: string;
  /**
   * The master CV it was copied from, or `null` once that master CV is deleted.
   * The copy keeps ALL of its content either way — only the provenance is lost.
   */
  base_cv_id: string | null;
  /**
   * The diff baseline (KODI-017). Read-only, never sent on `PUT` — see
   * `toTailoredCvPayload`, which never emits this key.
   */
  base_snapshot: TailoredCvSnapshot | null;
  /** Always `false` today. Nothing in the product generates a CV. */
  was_ai_generated: boolean;
  /** What "Tailor by keywords" reordered, per section; empty for a verbatim copy. */
  adjustments: TailoredCvAdjustment[];
  phone: string | null;
  created_at: string;
  /** `null` until the copy is first updated — the API's `TimeSchema` allows it. */
  updated_at: string | null;
}

/** Why a CV copy is read-only. The application is the authority, never the copy. */
export type TailoredCvReadOnlyReason = "finalized" | "archived";

/**
 * On-screen text for the read-only banner, per reason.
 *
 * Exported because the tests and the e2e suite assert on the words, and because
 * the two reasons are genuinely different facts about the application — a
 * single "read-only" message would hide which one applies.
 */
export const TAILORED_CV_READ_ONLY_COPY: Record<
  TailoredCvReadOnlyReason,
  { title: string; body: string }
> = {
  finalized: {
    title: "This application is closed.",
    body: "Reopen it to edit this CV.",
  },
  archived: {
    title: "This application is in a closed cycle",
    body: "Applications from a past cycle are archived. You can read this CV copy, but it can no longer be edited or deleted.",
  },
};

/**
 * The label shown in place of the source CV's name once that master CV is gone.
 * The words are the acceptance criterion; do not paraphrase them.
 */
export const TAILORED_CV_SOURCE_DELETED = "source CV deleted";
