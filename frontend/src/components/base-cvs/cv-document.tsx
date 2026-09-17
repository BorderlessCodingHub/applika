import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  CvEducation,
  CvScalars,
  CvSections,
  CvSkillCategory,
} from "@/components/base-cvs/types";

/** Everything the document renderer reads: identity scalars plus every section. */
export type CvDocumentData = CvScalars & CvSections;

/** Stable DOM id on the page root, so a later exporter can find the node. */
export const CV_DOCUMENT_EXPORT_ID = "cv-document-export-root";

/**
 * The toggled content sections, in render order. The identity header always
 * renders.
 *
 * The order is the template's, not a preference: summary first, then
 * experience, languages, skills, projects, education, certifications.
 */
export const CV_DOCUMENT_SECTIONS = [
  "summary",
  "experience",
  "languages",
  "skills",
  "projects",
  "education",
  "certifications",
] as const;

export type CvDocumentSection = (typeof CV_DOCUMENT_SECTIONS)[number];

/**
 * Joins the keywords of one skill category. U+00B7 MIDDLE DOT with a space
 * each side — NOT U+2022 BULLET, and never a comma.
 */
export const CV_KEYWORD_SEPARATOR = " · ";

/** Sits between a degree and its field of study on the education line. */
export const CV_EDUCATION_DEGREE_JOINER = " in ";

/**
 * The category name as it prints: always closed with a colon, never doubled.
 *
 * A blank name gets no colon — the server's `_skill_category_label` returns the
 * empty string for one, and a lone `:` is not a heading.
 */
export function skillCategoryHeading(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return "";
  return trimmed.endsWith(":") ? trimmed : `${trimmed}:`;
}

/** The second line of an education entry: the degree, then its field of study. */
export function educationDegreeLine(entry: CvEducation): string {
  const degree = entry.degree.trim();
  const area = entry.area?.trim();
  if (!area) return degree;
  if (!degree) return area;
  return `${degree}${CV_EDUCATION_DEGREE_JOINER}${area}`;
}

/**
 * The categories that print: a category needs a name or at least one keyword.
 * A named category with no keyword keeps its heading — the server's renderer
 * does the same (`cv_rendering/mapper.py`, `_skill_entries`), and the preview
 * must not promise a line the PDF drops or drop one the PDF prints.
 */
export function visibleSkillCategories(
  skills: CvSkillCategory[],
): CvSkillCategory[] {
  return skills.filter(
    (entry) => entry.category.trim() !== "" || entry.keywords.length > 0,
  );
}

/**
 * The education entries that print: anything typed into a row makes it real.
 *
 * All four fields count, not just the two that are required. The server's
 * `_education_entries` uses the same rule, and a narrower one here would make
 * the whole section vanish from the LIVE preview while a user is part-way
 * through a row — they fill the period, and the heading they were looking at
 * disappears. `visibleSkillCategories` above answers the same question the
 * same way.
 */
export function visibleEducation(education: CvEducation[]): CvEducation[] {
  return education.filter(
    (entry) =>
      entry.institution.trim() !== "" ||
      entry.degree.trim() !== "" ||
      (entry.area ?? "").trim() !== "" ||
      (entry.period ?? "").trim() !== "",
  );
}

/**
 * The section keys that will render for `cv`, in render order — a section
 * renders only when it has content. Pure, so it can be unit tested on its own.
 */
export function getPopulatedCvSections(
  cv: CvDocumentData,
): CvDocumentSection[] {
  const present: Record<CvDocumentSection, boolean> = {
    summary: Boolean(cv.summary?.trim()),
    experience: cv.experience.length > 0,
    languages: cv.languages.length > 0,
    skills: visibleSkillCategories(cv.skills).length > 0,
    projects: cv.projects.length > 0,
    education: visibleEducation(cv.education).length > 0,
    certifications: cv.certifications.length > 0,
  };

  return CV_DOCUMENT_SECTIONS.filter((key) => present[key]);
}

export interface CvDocumentProps {
  cv: CvDocumentData;
  /** Overrides {@link CV_DOCUMENT_EXPORT_ID} when more than one document is mounted. */
  exportId?: string;
  className?: string;
}

/**
 * The typeset master CV: an A4 portrait page, white with dark neutral text and
 * one accent. It deliberately does NOT use the app's semantic tokens — it is a
 * print artefact that must look the same in light and dark mode, and it is the
 * node a later export step rasterises.
 *
 * Pure: props in, markup out. No state, no fetching, no browser APIs.
 */
export function CvDocument({
  cv,
  exportId = CV_DOCUMENT_EXPORT_ID,
  className,
}: CvDocumentProps) {
  const populated = new Set(getPopulatedCvSections(cv));
  const skills = visibleSkillCategories(cv.skills);
  const education = visibleEducation(cv.education);

  return (
    <article
      id={exportId}
      data-slot="cv-document"
      aria-label={`CV preview for ${cv.full_name || "your CV"}`}
      className={cn(
        "mx-auto max-w-full bg-white px-[15mm] py-[15mm] font-serif text-neutral-900",
        className,
      )}
      style={{ width: "210mm", minHeight: "297mm" }}
    >
      {/*
        The identity block is TIGHT: name, headline and contact line sit on
        consecutive lines with no rule and no gap between them, as the template
        prints them.
      */}
      <header className="text-center">
        <h2 className="text-2xl leading-[1.1] font-semibold tracking-[0.18em] text-neutral-900 uppercase">
          {cv.full_name}
        </h2>
        {cv.headline ? (
          <p className="mt-0.5 text-[11px] leading-snug tracking-wide text-neutral-700">
            {cv.headline}
          </p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10.5px] leading-snug text-neutral-600">
          {cv.phone ? (
            <>
              <span>{cv.phone}</span>
              <Dot />
            </>
          ) : null}
          {cv.email ? <span>{cv.email}</span> : null}
          {cv.links.map((link) => (
            <span key={link.id} className="contents">
              <Dot />
              <span className="underline decoration-neutral-400 underline-offset-2">
                {link.label || link.url}
              </span>
            </span>
          ))}
          {cv.location ? (
            <>
              <Dot />
              <span>{cv.location}</span>
            </>
          ) : null}
        </div>
      </header>

      {populated.has("summary") ? (
        <DocumentSection title="Summary">
          <p className="text-[11.5px] leading-relaxed text-neutral-700">
            {cv.summary}
          </p>
        </DocumentSection>
      ) : null}

      {populated.has("experience") ? (
        <DocumentSection title="Experience">
          <div className="space-y-3">
            {cv.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-neutral-800">
                    {exp.company}
                  </p>
                  {exp.location ? (
                    <span className="shrink-0 text-[10.5px] text-neutral-600">
                      {exp.location}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11.5px] font-medium text-neutral-900">
                    {exp.role}
                  </p>
                  <span className="shrink-0 text-[10.5px] text-neutral-600">
                    {exp.period}
                  </span>
                </div>
                {exp.company_description ? (
                  <p className="mt-0.5 text-[10.5px] text-neutral-600 italic">
                    {exp.company_description}
                  </p>
                ) : null}
                {exp.bullets.filter(Boolean).length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-neutral-700">
                    {exp.bullets.filter(Boolean).map((bullet, index) => (
                      <li key={index}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </DocumentSection>
      ) : null}

      {/*
        Three columns, filled from the LEFT at any count, and the level said in
        words. No proficiency meter: the template prints none, so neither does
        the preview.
      */}
      {populated.has("languages") ? (
        <DocumentSection title="Languages">
          <ul className="grid grid-cols-3 gap-x-6 gap-y-1 text-[11px]">
            {cv.languages.map((language) => (
              <li key={language.id} className="flex items-baseline gap-1.5">
                <span className="font-semibold text-neutral-900">
                  {language.name}
                </span>
                <span className="text-neutral-600">{language.level}</span>
              </li>
            ))}
          </ul>
        </DocumentSection>
      ) : null}

      {/*
        One block per CATEGORY: a bold heading line, then its keywords on the
        line under it joined by a middle dot.
      */}
      {populated.has("skills") ? (
        <DocumentSection title="Skills">
          <div className="space-y-2">
            {skills.map((entry) => (
              <div key={entry.id} className="text-[11px]">
                {entry.category.trim() ? (
                  <p className="font-semibold text-neutral-900">
                    {skillCategoryHeading(entry.category)}
                  </p>
                ) : null}
                {entry.keywords.length > 0 ? (
                  <p className="leading-relaxed text-neutral-700">
                    {entry.keywords.join(CV_KEYWORD_SEPARATOR)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </DocumentSection>
      ) : null}

      {/* Three lines, always in this order: name, link, description. */}
      {populated.has("projects") ? (
        <DocumentSection title="Projects">
          <div className="space-y-2">
            {cv.projects.map((project) => (
              <div key={project.id} className="text-[11px]">
                <p className="font-semibold text-neutral-900">{project.name}</p>
                {project.link ? (
                  <p className="text-[10.5px] break-words text-blue-700">
                    {project.link_label?.trim() || project.link}
                    <span aria-hidden> {"↗"}</span>
                  </p>
                ) : null}
                {project.description ? (
                  <p className="text-neutral-700">{project.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        </DocumentSection>
      ) : null}

      {populated.has("education") ? (
        <DocumentSection title="Education">
          <div className="space-y-2">
            {education.map((entry) => (
              <div key={entry.id} className="text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-neutral-900">{entry.institution}</p>
                  {entry.period ? (
                    <span className="shrink-0 text-[10.5px] text-neutral-600">
                      {entry.period}
                    </span>
                  ) : null}
                </div>
                {educationDegreeLine(entry) ? (
                  <p className="text-neutral-700">
                    {educationDegreeLine(entry)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </DocumentSection>
      ) : null}

      {populated.has("certifications") ? (
        <DocumentSection title="Certifications">
          {/*
            The NAME is the bold half. The server emits `**name** issuer`
            (`_labelled_line`) and the owner's reference CV prints it that way;
            this used to be the other way round, which read as though the
            issuer were the qualification.
          */}
          <ul className="space-y-1 text-[11px] text-neutral-700">
            {cv.certifications.map((certification) => (
              <li key={certification.id}>
                <span className="font-semibold text-neutral-900">
                  {certification.name}
                </span>
                {" — "}
                <span className="text-neutral-600">{certification.issuer}</span>
              </li>
            ))}
          </ul>
        </DocumentSection>
      ) : null}
    </article>
  );
}

/** Middot separator for the contact line. Decorative. */
function Dot() {
  return (
    <span aria-hidden className="text-neutral-400">
      •
    </span>
  );
}

/** A titled document section with a ruled heading. */
function DocumentSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5">
      <h3 className="border-b border-neutral-300 pb-1 text-center text-[13px] font-semibold tracking-wide text-neutral-900 uppercase">
        {title}
      </h3>
      <div className="pt-2">{children}</div>
    </section>
  );
}
