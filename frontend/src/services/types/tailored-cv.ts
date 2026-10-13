import type { BaseCvWritable } from "@/services/types/base-cv";
import type { TailoredCv } from "@/components/tailored-cvs/types";

/**
 * Wire shapes for `/applications/{id}/cv` — the per-application CV copy.
 *
 * As with `base-cv.ts`, the vocabulary is not forked: the persisted shape lives
 * in `@/components/tailored-cvs/types` and is re-exported here so the service,
 * the hooks and the page speak one language. Snowflake ids are strings on the
 * wire and `user_id` never crosses it.
 */
export type { TailoredCv };

/**
 * How the copy is made (ADR-0017). `copy` is verbatim and the default
 * everywhere; `keywords` reorders skills and bullets by the job description
 * (the server 422s it when the application has no job description).
 */
export type TailoringMode = "copy" | "keywords";

/**
 * `POST /applications/{id}/cv` body.
 *
 * The copy is made by the server from the chosen master CV — the client sends
 * the source and, opt-in, `tailoring: "keywords"` (R-026).
 */
export interface CreateTailoredCvPayload {
  base_cv_id: string;
  tailoring?: TailoringMode;
}

/**
 * `GET /applications/{id}/cv/fit` (R-028): the copy's keyword fit against the
 * application's job description. `score` is `null` (and both lists empty) when
 * the job description is blank. A 404 means no copy (or not owned): no panel.
 */
export interface CvFit {
  score: number | null;
  matched_keywords: string[];
  missing_keywords: string[];
}

/**
 * `PUT /applications/{id}/cv` body: every editable field of the copy.
 *
 * The same writable field set as a master CV, because the copy IS a master CV's
 * field set. `PUT` is a full replace, not a patch, so the editor always sends
 * all of it.
 */
export type UpdateTailoredCvPayload = BaseCvWritable;
