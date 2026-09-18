/**
 * Presentation-layer shapes for the master CV (base CV) surface.
 *
 * They mirror the API payload field for field (snake_case) so the components
 * under `base-cvs/` and the service types share one vocabulary. Sub-item `id`s
 * are client-generated and preserved round-trip — including `links`, which in
 * applika DOES carry an `id`.
 */

/** Hard cap on master CVs per user. */
export const BASE_CVS_MAX = 3;

/** A labelled external profile or portfolio link. */
export interface CvLink {
  id: string;
  label: string;
  url: string;
}

/**
 * One role in the experience section.
 *
 * The period is a PAIR of CV dates, never free text. `start` is required;
 * `end` is optional and an absent, `null` or empty finish means the role is
 * current — the document prints `present` for it. Both are ISO `YYYY-MM` in
 * store and on the wire; `MM/yyyy` is only what the user types and reads, and
 * `src/lib/month-year.ts` owns the two conversions.
 */
export interface CvExperience {
  id: string;
  company: string;
  company_description?: string;
  role: string;
  /** ISO `YYYY-MM`. Required — a role without a start is not a role. */
  start: string;
  /** ISO `YYYY-MM`, or absent/`null` for a role the user is still in. */
  end?: string | null;
  location?: string;
  bullets: string[];
}

/** One project entry. */
export interface CvProject {
  id: string;
  name: string;
  description: string;
  link?: string;
  link_label?: string;
}

/**
 * One named group of skills and the keywords inside it. Skills are NOT a flat
 * tag list: the document prints the category as a bold line and its keywords
 * under it, joined by a middle dot.
 */
export interface CvSkillCategory {
  id: string;
  category: string;
  keywords: string[];
}

/**
 * The names of the skill categories that carry one, in print order.
 *
 * What the COPY PICKER shows in place of the full keyword lists: it has room
 * for a handful of chips, not for six categories of keywords. The `/cvs` card
 * does NOT use this — it badges the keywords themselves ({@link skillKeywords}).
 * A category with keywords but no name cannot be saved (the API declares
 * `category` `min_length=1`), so it has no label to show.
 */
export function skillCategoryNames(skills: CvSkillCategory[]): string[] {
  return skills.map((entry) => entry.category.trim()).filter(Boolean);
}

/**
 * Every keyword of every category, flattened into ONE list and DEDUPLICATED,
 * in print order.
 *
 * The owner: "display all keywords of all categories but still in badges as
 * was in the first place (but do not display skills repetedly)". The `/cvs`
 * card is a gallery tile, not the typeset document: it answers "what is in
 * this CV", and which heading a keyword sits under is the document's business.
 * So the category is NOT part of what this returns.
 *
 * **The comparison rule:** each keyword is TRIMMED, compared
 * CASE-INSENSITIVELY, and the FIRST occurrence keeps its ORIGINAL casing.
 * `Python` under one category and ` python ` under another are one skill, and
 * the badge reads `Python`. A whitespace-only keyword is nothing and is
 * dropped.
 *
 * A keyword under a category with no name is still returned. The old
 * per-category summary dropped those because an unnamed category had no label
 * to show; with the label gone from this card, that reason is gone too, and
 * dropping the keyword would hide a skill the user really typed.
 */
export function skillKeywords(skills: CvSkillCategory[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const entry of skills) {
    for (const raw of entry.keywords) {
      const keyword = raw.trim();
      if (!keyword) continue;
      const key = keyword.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      keywords.push(keyword);
    }
  }
  return keywords;
}

/**
 * One entry in the education section.
 *
 * Its period is the same required-start / optional-finish pair as
 * `CvExperience`, and required on this section too — the owner: "Today for
 * Education and Experience, the period input is optional, this must be
 * required". An absent, `null` or empty `end` means the course is ongoing and
 * prints `present`.
 */
export interface CvEducation {
  id: string;
  institution: string;
  degree: string;
  area?: string;
  /** ISO `YYYY-MM`. Required, exactly like `CvExperience.start`. */
  start: string;
  /** ISO `YYYY-MM`, or absent/`null` for a course still under way. */
  end?: string | null;
}

/** One professional certification. */
export interface CvCertification {
  id: string;
  name: string;
  issuer: string;
}

export type CvLanguageLevel =
  | "Native"
  | "Proficient"
  | "Conversational"
  | "Read/Comprehend"
  | "Basic";

/** Proficiency options, strongest first. The document prints the level verbatim. */
export const CV_LANGUAGE_LEVELS: readonly CvLanguageLevel[] = [
  "Native",
  "Proficient",
  "Conversational",
  "Read/Comprehend",
  "Basic",
];

/** One spoken language and its proficiency. */
export interface CvLanguage {
  id: string;
  name: string;
  level: CvLanguageLevel;
}

/**
 * Identity, contact and summary fields, as READ by the document renderer.
 * `phone` is optional and may arrive as `null` from the API.
 */
export interface CvScalars {
  name: string;
  full_name: string;
  headline: string;
  location: string;
  email: string;
  phone?: string | null;
  summary: string;
}

/** The seven list sections a master CV carries. */
export interface CvSections {
  links: CvLink[];
  skills: CvSkillCategory[];
  experience: CvExperience[];
  projects: CvProject[];
  education: CvEducation[];
  certifications: CvCertification[];
  languages: CvLanguage[];
}

/**
 * The editable shape the form owns. Identical to `CvScalars & CvSections`
 * except that `phone` is always a string (`""` when unset) so every input stays
 * controlled; the service maps `""` to `null` on the wire.
 */
export interface CvFormValues extends CvSections {
  name: string;
  full_name: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  summary: string;
}

/** A persisted master CV as returned by the API. */
export interface BaseCv extends CvScalars, CvSections {
  id: string;
  phone: string | null;
  created_at: string;
  /** `null` until the CV is first updated — the API's `TimeSchema` allows it. */
  updated_at: string | null;
}

/**
 * Said wherever the on-screen CV is shown or a PDF is asked for.
 *
 * The PDF is typeset on the server (ADR 0011) from the stored CV data, so the
 * browser render is an approximation of the content, never of the page breaks,
 * the fonts or the spacing. The words are the acceptance criterion; do not
 * paraphrase them.
 */
export const CV_PDF_LAYOUT_NOTICE =
  "Preview does not show the final PDF layout.";

/** Announced while the server typesets the PDF. A render takes a few seconds. */
export const CV_PDF_EXPORT_PENDING =
  "Preparing your PDF. This can take a few seconds.";

/** Visible text and accessible name of the export action. */
export const CV_PDF_EXPORT_LABEL = "Download PDF";
