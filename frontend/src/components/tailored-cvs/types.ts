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

import type {
  BaseCv,
  CvScalars,
  CvSections,
} from "@/components/base-cvs/types";

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
  /** Always `false` today. Nothing in the product generates a CV. */
  was_ai_generated: boolean;
  /** Always empty today. Reserved by the API contract. */
  adjustments: unknown[];
  phone: string | null;
  created_at: string;
  /** `null` until the copy is first updated — the API's `TimeSchema` allows it. */
  updated_at: string | null;
}

/**
 * What the picker renders per master CV. `BaseCv[]` is assignable to
 * `BaseCvOption[]`, so the page can hand `useBaseCvs()` straight over.
 */
export type BaseCvOption = Pick<
  BaseCv,
  "id" | "name" | "full_name" | "headline" | "skills" | "updated_at"
>;

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
    title: "This application is finalized",
    body: "Its CV copy stays exactly as it was. You can read it, but it can no longer be edited or deleted.",
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
