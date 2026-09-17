import type { FieldErrors } from "react-hook-form";
import { z } from "zod";

import {
  CV_LANGUAGE_LEVELS,
  type BaseCv,
  type CvFormValues,
} from "@/components/base-cvs/types";
import type { CreateBaseCvPayload } from "@/services/types/base-cv";

/**
 * Validation and the two mappings around the master CV form.
 *
 * The form owns `CvFormValues`: every scalar is a string (`phone` is `""` when
 * unset) so no input ever goes uncontrolled. The wire owns `BaseCv`, where
 * `phone` is `null`. `toBaseCvPayload` is the only place that translation
 * happens; `baseCvToFormValues` is the only place it happens back.
 *
 * `z.infer<typeof baseCvSchema>` is assignable to `CvFormValues` — the editor
 * is typed `UseFormReturn<CvFormValues>` and the resolver has to agree.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: string | null | undefined) => (value ?? "").trim();

/** A trimmed value, or `undefined` so the key is omitted from the JSON body. */
const optionalText = (value: string | null | undefined) =>
  text(value) || undefined;

const lines = (values: string[] | undefined) =>
  (values ?? []).map((line) => line.trim()).filter(Boolean);

/**
 * A row the user added and never typed into.
 *
 * Every section control adds a blank row on demand, so an untouched one is not
 * an error: `toBaseCvPayload` drops it. A row with ANYTHING in it is real data
 * and has to be complete, because the API requires every field these
 * predicates name (`min_length=1`) and would answer 422 — which the editor has
 * no per-row slot to show.
 */
const isBlankLink = (item: { label: string; url: string }) =>
  !text(item.label) && !text(item.url);

const isBlankExperience = (item: {
  company: string;
  company_description?: string;
  role: string;
  period: string;
  location?: string;
  bullets: string[];
}) =>
  !text(item.company) &&
  !text(item.role) &&
  !text(item.period) &&
  !text(item.company_description) &&
  !text(item.location) &&
  lines(item.bullets).length === 0;

const isBlankProject = (item: {
  name: string;
  description: string;
  link?: string;
  link_label?: string;
}) =>
  !text(item.name) &&
  !text(item.description) &&
  !text(item.link) &&
  !text(item.link_label);

const isBlankCertification = (item: { name: string; issuer: string }) =>
  !text(item.name) && !text(item.issuer);

const isBlankLanguage = (item: { name: string }) => !text(item.name);

/** A non-blank single-line string. Whitespace alone does not count. */
const requiredText = (message: string, max: number) =>
  z
    .string()
    .max(max, `Keep this under ${max} characters`)
    .refine((value) => value.trim().length > 0, message);

const linkSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string(),
});

const experienceSchema = z.object({
  id: z.string(),
  company: z.string(),
  company_description: z.string().optional(),
  role: z.string(),
  period: z.string(),
  location: z.string().optional(),
  bullets: z.array(z.string()),
});

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  link: z.string().optional(),
  link_label: z.string().optional(),
});

const certificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
});

const languageSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.enum(CV_LANGUAGE_LEVELS),
});

/**
 * The master CV form schema.
 *
 * Required: the label, the identity and contact block (bar the phone) and the
 * summary — exactly the fields the editor marks with a required marker, each of
 * which has an inline error slot. `phone` is optional.
 *
 * NO SECTION IS REQUIRED and no field INSIDE a section is: a CV with zero
 * links, skills, roles, projects, certifications and languages validates. Rows
 * carry no per-row error slot in the editor, so a row-level constraint would be
 * an invisible wall; `toBaseCvPayload` drops blank rows instead of rejecting
 * them.
 */
export const baseCvSchema = z.object({
  name: requiredText("A CV label is required", 120),
  full_name: requiredText("Your full name is required", 160),
  headline: requiredText("A headline is required", 200),
  location: requiredText("A location is required", 160),
  email: z
    .string()
    .max(255, "Keep this under 255 characters")
    .superRefine((value, ctx) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        ctx.addIssue({ code: "custom", message: "An email is required" });
        return;
      }
      if (!EMAIL_PATTERN.test(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid email address",
        });
      }
    }),
  phone: z.string().max(40, "Keep this under 40 characters"),
  summary: requiredText("A summary is required", 4000),
  links: z
    .array(linkSchema)
    .refine(
      (items) =>
        items.every(
          (item) => isBlankLink(item) || (text(item.label) && text(item.url)),
        ),
      "Every link needs a label and a URL. Remove the rows you do not want.",
    ),
  skills: z.array(z.string()),
  experience: z
    .array(experienceSchema)
    .refine(
      (items) =>
        items.every(
          (item) =>
            isBlankExperience(item) ||
            (text(item.company) && text(item.role) && text(item.period)),
        ),
      "Every role needs a company, a role and a period. Remove the rows you do not want.",
    ),
  projects: z
    .array(projectSchema)
    .refine(
      (items) => items.every((item) => isBlankProject(item) || text(item.name)),
      "Every project needs a name. Remove the rows you do not want.",
    ),
  certifications: z
    .array(certificationSchema)
    .refine(
      (items) =>
        items.every(
          (item) =>
            isBlankCertification(item) ||
            (text(item.name) && text(item.issuer)),
        ),
      "Every certification needs a name and an issuer. Remove the rows you do not want.",
    ),
  languages: z
    .array(languageSchema)
    .refine(
      (items) =>
        items.every((item) => isBlankLanguage(item) || text(item.name)),
      "Every language needs a name. Remove the rows you do not want.",
    ),
});

/** The section fields, in the order the editor renders them. */
const SECTION_FIELDS = [
  "links",
  "skills",
  "experience",
  "projects",
  "certifications",
  "languages",
] as const;

/**
 * The first section-level validation message, if any.
 *
 * The editor renders an inline slot for every scalar and for `skills`, but a
 * section list has none — so the create and edit routes pass this to a toast
 * from their `onInvalid` handler. Without it a half-filled row would block the
 * submit with nothing on screen to explain why.
 */
export function sectionErrorMessage(
  errors: FieldErrors<CvFormValues>,
): string | undefined {
  for (const field of SECTION_FIELDS) {
    const message = errors[field]?.message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

/**
 * Compile-time proof that the resolver output is what the editor expects:
 * `BaseCvFormValues` does not type-check unless `z.infer<typeof baseCvSchema>`
 * is assignable to `CvFormValues`. Types only — it emits no runtime code.
 */
type AssignableToFormValues<T extends CvFormValues> = T;
export type BaseCvFormValues = AssignableToFormValues<
  z.infer<typeof baseCvSchema>
>;

/** Defaults for the create route: everything blank, every section empty. */
export function emptyBaseCvValues(): CvFormValues {
  return {
    name: "",
    full_name: "",
    headline: "",
    location: "",
    email: "",
    phone: "",
    summary: "",
    links: [],
    skills: [],
    experience: [],
    projects: [],
    certifications: [],
    languages: [],
  };
}

/**
 * Server shape to form shape, for `form.reset()` on the edit route.
 *
 * Client-generated item `id`s are carried over untouched — regenerating them
 * would break the round trip and remount every row.
 */
export function baseCvToFormValues(cv: BaseCv): CvFormValues {
  return {
    name: cv.name ?? "",
    full_name: cv.full_name ?? "",
    headline: cv.headline ?? "",
    location: cv.location ?? "",
    email: cv.email ?? "",
    phone: cv.phone ?? "",
    summary: cv.summary ?? "",
    links: (cv.links ?? []).map((link) => ({
      id: link.id,
      label: link.label ?? "",
      url: link.url ?? "",
    })),
    skills: [...(cv.skills ?? [])],
    experience: (cv.experience ?? []).map((item) => ({
      id: item.id,
      company: item.company ?? "",
      company_description: item.company_description ?? "",
      role: item.role ?? "",
      period: item.period ?? "",
      location: item.location ?? "",
      bullets: [...(item.bullets ?? [])],
    })),
    projects: (cv.projects ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "",
      description: item.description ?? "",
      link: item.link ?? "",
      link_label: item.link_label ?? "",
    })),
    certifications: (cv.certifications ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "",
      issuer: item.issuer ?? "",
    })),
    languages: (cv.languages ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "",
      level: item.level,
    })),
  };
}

/**
 * Form shape to wire shape.
 *
 * Trims every string, maps the form's `""` phone to the wire's `null`, drops
 * blank list entries and drops fully-empty rows — a row the user added and
 * never filled in is not data. It never emits `id`, `created_at` or
 * `updated_at`: those are server-owned.
 */
export function toBaseCvPayload(values: CvFormValues): CreateBaseCvPayload {
  return {
    name: text(values.name),
    full_name: text(values.full_name),
    headline: text(values.headline),
    location: text(values.location),
    email: text(values.email),
    phone: text(values.phone) || null,
    summary: text(values.summary),
    links: (values.links ?? [])
      .map((link) => ({
        id: link.id,
        label: text(link.label),
        url: text(link.url),
      }))
      .filter((link) => !isBlankLink(link)),
    skills: lines(values.skills),
    experience: (values.experience ?? [])
      .map((item) => ({
        id: item.id,
        company: text(item.company),
        company_description: optionalText(item.company_description),
        role: text(item.role),
        period: text(item.period),
        location: optionalText(item.location),
        bullets: lines(item.bullets),
      }))
      .filter((item) => !isBlankExperience(item)),
    projects: (values.projects ?? [])
      .map((item) => ({
        id: item.id,
        name: text(item.name),
        description: text(item.description),
        link: optionalText(item.link),
        link_label: optionalText(item.link_label),
      }))
      .filter((item) => !isBlankProject(item)),
    certifications: (values.certifications ?? [])
      .map((item) => ({
        id: item.id,
        name: text(item.name),
        issuer: text(item.issuer),
      }))
      .filter((item) => !isBlankCertification(item)),
    languages: (values.languages ?? [])
      .map((item) => ({
        id: item.id,
        name: text(item.name),
        level: item.level,
      }))
      .filter((item) => !isBlankLanguage(item)),
  };
}
