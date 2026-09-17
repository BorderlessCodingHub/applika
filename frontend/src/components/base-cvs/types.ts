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

/** One role in the experience section. */
export interface CvExperience {
  id: string;
  company: string;
  company_description?: string;
  role: string;
  period: string;
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

/** Proficiency options, strongest first. Index drives the document's dot meter. */
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

/** The six list sections a master CV carries. */
export interface CvSections {
  links: CvLink[];
  skills: string[];
  experience: CvExperience[];
  projects: CvProject[];
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
