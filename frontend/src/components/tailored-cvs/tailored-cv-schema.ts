import { z } from "zod";

import { sectionErrorMessage } from "@/components/base-cvs/base-cv-schema";
import {
  CV_LANGUAGE_LEVELS,
  type CvFormValues,
} from "@/components/base-cvs/types";
import type { BaseCvWritable } from "@/services/types/base-cv";
import type { TailoredCv } from "@/components/tailored-cvs/types";

/**
 * Validation and the two mappings around the tailored CV form.
 *
 * It mirrors `base-cv-schema.ts` field for field — same form shape
 * (`CvFormValues`), same required set, same "a blank row is not an error"
 * rule — because the copy IS a master CV's field set. What differs is the wire
 * shape it maps to (`PUT /applications/{id}/cv`) and the LENGTH ceilings, which
 * are spelled out here for every field, including the ones inside sections.
 *
 * Why the ceilings matter: `getApiError` renders FastAPI's `detail` unguarded,
 * and a 422 `detail` is an array of objects, so a validation error from the
 * server would reach the toast as garbage. Every ceiling below is at or under
 * the server's, which puts a 422 out of the user's reach.
 *
 * Rows have no inline error slot (`cv-repeatable-section.tsx` renders none), so
 * a row-level failure is reported at SECTION level and the page surfaces it
 * with `sectionErrorMessage()` in a toast — the same contract the master CV
 * form already has.
 */

/**
 * Client-side ceilings, at or under the server's.
 *
 * The scalars keep the master CV's stricter numbers so the two forms accept
 * exactly the same text; the section fields carry the server's.
 */
export const TAILORED_CV_MAX = {
  name: 120,
  full_name: 160,
  headline: 200,
  location: 160,
  email: 255,
  phone: 40,
  summary: 4000,
  linkLabel: 100,
  linkUrl: 500,
  experienceCompany: 200,
  experienceRole: 200,
  experiencePeriod: 100,
  experienceLocation: 200,
  experienceCompanyDescription: 500,
  experienceBullet: 2000,
  skillCategory: 100,
  skillKeyword: 100,
  projectName: 200,
  projectDescription: 2000,
  projectLink: 500,
  projectLinkLabel: 100,
  educationInstitution: 200,
  educationDegree: 200,
  educationArea: 200,
  educationPeriod: 100,
  certificationName: 200,
  certificationIssuer: 200,
  languageName: 100,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: string | null | undefined) => (value ?? "").trim();

/** A trimmed value, or `undefined` so the key is omitted from the JSON body. */
const optionalText = (value: string | null | undefined) =>
  text(value) || undefined;

const lines = (values: string[] | undefined) =>
  (values ?? []).map((line) => line.trim()).filter(Boolean);

/** Every string in the list is within its ceiling. */
const within = (max: number, ...values: (string | undefined)[]) =>
  values.every((value) => (value ?? "").trim().length <= max);

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

/**
 * A skill category nobody typed into. Keywords count: a category with keywords
 * but no name is half-filled, not blank, and the API refuses it
 * (`SkillCategoryIn.category` is `min_length=1`).
 */
const isBlankSkillCategory = (item: { category: string; keywords: string[] }) =>
  !text(item.category) && lines(item.keywords).length === 0;

/** An education row nobody typed into — any of its four fields makes it real. */
const isBlankEducation = (item: {
  institution: string;
  degree: string;
  area?: string;
  period?: string;
}) =>
  !text(item.institution) &&
  !text(item.degree) &&
  !text(item.area) &&
  !text(item.period);

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

/**
 * Skills are CATEGORIES, never a flat tag list. The owner: "it's a section
 * where i can create a category and inside this caregory add keywords".
 */
const skillCategorySchema = z.object({
  id: z.string(),
  category: z.string(),
  keywords: z.array(z.string()),
});

/** `period` is free text, exactly like `CvExperience.period`. */
const educationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string(),
  area: z.string().optional(),
  period: z.string().optional(),
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
 * The tailored CV form schema. Required: the label, the identity and contact
 * block (bar the phone) and the summary — exactly the fields the editor marks
 * with a required marker. No section is required and no field inside a section
 * is; blank rows are dropped on the way to the wire.
 */
export const tailoredCvSchema = z.object({
  name: requiredText("A CV label is required", TAILORED_CV_MAX.name),
  full_name: requiredText("A full name is required", TAILORED_CV_MAX.full_name),
  headline: requiredText("A headline is required", TAILORED_CV_MAX.headline),
  location: requiredText("A location is required", TAILORED_CV_MAX.location),
  email: z
    .string()
    .max(
      TAILORED_CV_MAX.email,
      `Keep this under ${TAILORED_CV_MAX.email} characters`,
    )
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
  phone: z
    .string()
    .max(
      TAILORED_CV_MAX.phone,
      `Keep this under ${TAILORED_CV_MAX.phone} characters`,
    ),
  summary: requiredText("A summary is required", TAILORED_CV_MAX.summary),
  links: z
    .array(linkSchema)
    .refine(
      (items) =>
        items.every(
          (item) => isBlankLink(item) || (text(item.label) && text(item.url)),
        ),
      "Every link needs a label and a URL. Remove the rows you do not want.",
    )
    .refine(
      (items) =>
        items.every(
          (item) =>
            within(TAILORED_CV_MAX.linkLabel, item.label) &&
            within(TAILORED_CV_MAX.linkUrl, item.url),
        ),
      `Keep every link label under ${TAILORED_CV_MAX.linkLabel} characters and every URL under ${TAILORED_CV_MAX.linkUrl}.`,
    ),
  skills: z
    .array(skillCategorySchema)
    .refine(
      (items) =>
        items.every(
          (item) => isBlankSkillCategory(item) || text(item.category),
        ),
      "Every skill category needs a name. Remove the categories you do not want.",
    )
    .refine(
      (items) =>
        items.every(
          (item) =>
            within(TAILORED_CV_MAX.skillCategory, item.category) &&
            within(TAILORED_CV_MAX.skillKeyword, ...item.keywords),
        ),
      `Keep every category name under ${TAILORED_CV_MAX.skillCategory} characters and every keyword under ${TAILORED_CV_MAX.skillKeyword}.`,
    ),
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
    )
    .refine(
      (items) =>
        items.every(
          (item) =>
            within(
              TAILORED_CV_MAX.experienceCompany,
              item.company,
              item.role,
              item.location,
            ) &&
            within(TAILORED_CV_MAX.experiencePeriod, item.period) &&
            within(
              TAILORED_CV_MAX.experienceCompanyDescription,
              item.company_description,
            ) &&
            within(TAILORED_CV_MAX.experienceBullet, ...item.bullets),
        ),
      `Keep every company, role and location under ${TAILORED_CV_MAX.experienceCompany} characters, every period under ${TAILORED_CV_MAX.experiencePeriod} and every company description under ${TAILORED_CV_MAX.experienceCompanyDescription}.`,
    ),
  projects: z
    .array(projectSchema)
    .refine(
      (items) => items.every((item) => isBlankProject(item) || text(item.name)),
      "Every project needs a name. Remove the rows you do not want.",
    )
    .refine(
      (items) =>
        items.every(
          (item) =>
            within(TAILORED_CV_MAX.projectName, item.name) &&
            within(TAILORED_CV_MAX.projectDescription, item.description) &&
            within(TAILORED_CV_MAX.projectLink, item.link) &&
            within(TAILORED_CV_MAX.projectLinkLabel, item.link_label),
        ),
      `Keep every project name under ${TAILORED_CV_MAX.projectName} characters and every description under ${TAILORED_CV_MAX.projectDescription}.`,
    ),
  education: z
    .array(educationSchema)
    .refine(
      (items) =>
        items.every(
          (item) =>
            isBlankEducation(item) ||
            (text(item.institution) && text(item.degree)),
        ),
      "Every qualification needs an institution and a degree. Remove the rows you do not want.",
    )
    .refine(
      (items) =>
        items.every(
          (item) =>
            within(TAILORED_CV_MAX.educationInstitution, item.institution) &&
            within(TAILORED_CV_MAX.educationDegree, item.degree) &&
            within(TAILORED_CV_MAX.educationArea, item.area) &&
            within(TAILORED_CV_MAX.educationPeriod, item.period),
        ),
      `Keep every institution, degree and field of study under ${TAILORED_CV_MAX.educationInstitution} characters and every period under ${TAILORED_CV_MAX.educationPeriod}.`,
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
    )
    .refine(
      (items) =>
        items.every((item) =>
          within(TAILORED_CV_MAX.certificationName, item.name, item.issuer),
        ),
      `Keep every certification name and issuer under ${TAILORED_CV_MAX.certificationName} characters.`,
    ),
  languages: z
    .array(languageSchema)
    .refine(
      (items) =>
        items.every((item) => isBlankLanguage(item) || text(item.name)),
      "Every language needs a name. Remove the rows you do not want.",
    )
    .refine(
      (items) =>
        items.every((item) => within(TAILORED_CV_MAX.languageName, item.name)),
      `Keep every language under ${TAILORED_CV_MAX.languageName} characters.`,
    ),
});

/**
 * Compile-time proof that the resolver output is what the editor expects:
 * this alias does not type-check unless `z.infer<typeof tailoredCvSchema>` is
 * assignable to `CvFormValues`. Types only — it emits no runtime code.
 */
type AssignableToFormValues<T extends CvFormValues> = T;
export type TailoredCvFormValues = AssignableToFormValues<
  z.infer<typeof tailoredCvSchema>
>;

/**
 * The first section-level message, if any — re-exported from the master CV
 * schema rather than forked, because the sections and their error paths are the
 * same. The page passes it to a toast from its `onInvalid` handler; without it
 * an over-long row would block the submit with nothing on screen.
 */
export { sectionErrorMessage };

/** `PUT /applications/{id}/cv` body: every editable field of the copy. */
export type TailoredCvPayload = BaseCvWritable;

/** Defaults for a form with no copy behind it yet. */
export function emptyTailoredCvValues(): CvFormValues {
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
    education: [],
    certifications: [],
    languages: [],
  };
}

/**
 * Server shape to form shape, for `form.reset()` once the copy loads.
 *
 * Client-generated item `id`s are carried over untouched — regenerating them
 * would break the round trip and remount every row.
 */
export function tailoredCvToFormValues(cv: TailoredCv): CvFormValues {
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
    skills: (cv.skills ?? []).map((item) => ({
      id: item.id,
      category: item.category ?? "",
      keywords: [...(item.keywords ?? [])],
    })),
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
    education: (cv.education ?? []).map((item) => ({
      id: item.id,
      institution: item.institution ?? "",
      degree: item.degree ?? "",
      area: item.area ?? "",
      period: item.period ?? "",
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
 * blank list entries and drops fully-empty rows. It never emits `id`,
 * `application_id`, `base_cv_id`, `was_ai_generated`, `adjustments`,
 * `created_at` or `updated_at`: those are server-owned.
 */
export function toTailoredCvPayload(values: CvFormValues): TailoredCvPayload {
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
    skills: (values.skills ?? [])
      .map((item) => ({
        id: item.id,
        category: text(item.category),
        keywords: lines(item.keywords),
      }))
      .filter((item) => !isBlankSkillCategory(item)),
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
    education: (values.education ?? [])
      .map((item) => ({
        id: item.id,
        institution: text(item.institution),
        degree: text(item.degree),
        area: optionalText(item.area),
        period: optionalText(item.period),
      }))
      .filter((item) => !isBlankEducation(item)),
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
