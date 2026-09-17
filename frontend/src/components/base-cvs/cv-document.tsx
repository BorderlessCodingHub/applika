import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CV_LANGUAGE_LEVELS,
  type CvLanguageLevel,
  type CvScalars,
  type CvSections,
} from "@/components/base-cvs/types";

/** Everything the document renderer reads: identity scalars plus every section. */
export type CvDocumentData = CvScalars & CvSections;

/** Stable DOM id on the page root, so a later exporter can find the node. */
export const CV_DOCUMENT_EXPORT_ID = "cv-document-export-root";

/** The toggled content sections, in render order. The identity header always renders. */
export const CV_DOCUMENT_SECTIONS = [
  "summary",
  "experience",
  "languages",
  "skills",
  "projects",
  "certifications",
] as const;

export type CvDocumentSection = (typeof CV_DOCUMENT_SECTIONS)[number];

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
    skills: cv.skills.length > 0,
    projects: cv.projects.length > 0,
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

/** Filled proficiency dots per level (Native = 5 … Basic = 1). */
function levelDots(level: CvLanguageLevel): number {
  const index = CV_LANGUAGE_LEVELS.indexOf(level);
  return index === -1 ? 0 : CV_LANGUAGE_LEVELS.length - index;
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
      <header className="text-center">
        <h2 className="text-2xl font-semibold tracking-[0.18em] text-neutral-900 uppercase">
          {cv.full_name}
        </h2>
        {cv.headline ? (
          <p className="mt-1 text-[11px] tracking-wide text-neutral-700">
            {cv.headline}
          </p>
        ) : null}
        <span
          aria-hidden
          className="mx-auto mt-2 block h-0.5 w-12 rounded-full bg-blue-700"
        />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10.5px] text-neutral-600">
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

      {populated.has("languages") ? (
        <DocumentSection title="Languages">
          <div className="flex flex-wrap items-center justify-around gap-x-4 gap-y-2">
            {cv.languages.map((language) => (
              <div
                key={language.id}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="font-semibold text-neutral-900">
                  {language.name}
                </span>
                <span className="text-neutral-600">{language.level}</span>
                <Dots filled={levelDots(language.level)} />
              </div>
            ))}
          </div>
        </DocumentSection>
      ) : null}

      {populated.has("skills") ? (
        <DocumentSection title="Skills">
          <div className="flex flex-wrap gap-1">
            {cv.skills.map((skill) => (
              <span
                key={skill}
                className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-medium text-neutral-700"
              >
                {skill}
              </span>
            ))}
          </div>
        </DocumentSection>
      ) : null}

      {populated.has("projects") ? (
        <DocumentSection title="Projects">
          <div className="space-y-2">
            {cv.projects.map((project) => (
              <div key={project.id} className="text-[11px]">
                <p className="font-semibold text-neutral-900">{project.name}</p>
                {project.link ? (
                  <p className="text-[10.5px] text-neutral-600">
                    {project.link_label || "Link"}:{" "}
                    <span className="underline decoration-neutral-400 underline-offset-2">
                      {project.link}
                    </span>
                  </p>
                ) : null}
                <p className="text-neutral-700">{project.description}</p>
              </div>
            ))}
          </div>
        </DocumentSection>
      ) : null}

      {populated.has("certifications") ? (
        <DocumentSection title="Certifications">
          <ul className="space-y-1 text-[11px] text-neutral-700">
            {cv.certifications.map((certification) => (
              <li key={certification.id}>
                <span className="text-neutral-600">{certification.name}</span>
                {" — "}
                <span className="font-medium text-neutral-900">
                  {certification.issuer}
                </span>
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

/** Five proficiency dots, `filled` of them solid. Decorative. */
function Dots({ filled }: { filled: number }) {
  return (
    <span aria-hidden className="flex items-center gap-0.5">
      {Array.from({ length: CV_LANGUAGE_LEVELS.length }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            index < filled ? "bg-neutral-800" : "bg-neutral-300",
          )}
        />
      ))}
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
