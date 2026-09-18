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
 * `POST /applications/{id}/cv` body.
 *
 * The copy is made by the server from the chosen master CV — the client sends
 * nothing but the source. That is the tailoring step: today it copies verbatim,
 * and the request shape does not change when it one day does more.
 */
export interface CreateTailoredCvPayload {
  base_cv_id: string;
}

/**
 * `PUT /applications/{id}/cv` body: every editable field of the copy.
 *
 * The same writable field set as a master CV, because the copy IS a master CV's
 * field set. `PUT` is a full replace, not a patch, so the editor always sends
 * all of it.
 */
export type UpdateTailoredCvPayload = BaseCvWritable;
