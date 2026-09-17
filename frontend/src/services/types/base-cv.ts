import type {
  BaseCv,
  CvCertification,
  CvExperience,
  CvLanguage,
  CvLanguageLevel,
  CvLink,
  CvProject,
  CvSections,
} from "@/components/base-cvs/types";

/**
 * Wire shapes for the master CV (base CV) endpoints.
 *
 * The vocabulary is NOT forked: the item shapes live in
 * `@/components/base-cvs/types` and are re-exported here so the service, the
 * hooks and the components speak one language. Sub-item `id`s are
 * client-generated strings preserved round-trip; snowflake ids are strings on
 * the wire; `user_id` never crosses it.
 */
export type {
  BaseCv,
  CvCertification,
  CvExperience,
  CvLanguage,
  CvLanguageLevel,
  CvLink,
  CvProject,
};

/**
 * Everything a client may write on a master CV — the persisted shape minus
 * `id`, `created_at` and `updated_at`, which are server-owned. `phone` is
 * `null` (not `""`) when the user left it blank.
 */
export interface BaseCvWritable extends CvSections {
  name: string;
  full_name: string;
  headline: string;
  location: string;
  email: string;
  phone: string | null;
  summary: string;
}

/** `POST /base-cvs` body. */
export type CreateBaseCvPayload = BaseCvWritable;

/** `PATCH /base-cvs/{id}` body. The endpoint is partial. */
export type UpdateBaseCvPayload = Partial<BaseCvWritable>;
