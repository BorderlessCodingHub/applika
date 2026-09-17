import type { ReactNode } from "react";
import { isoToMonthYear } from "@/lib/month-year";
import type {
  CvCertification,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvProject,
  CvScalars,
  CvSections,
  CvSkillCategory,
} from "@/components/base-cvs/types";

/** Everything the document renderer reads: identity scalars plus every section. */
export type CvDocumentData = CvScalars & CvSections;

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

/** The ruled heading each section prints above its content. */
export const CV_SECTION_TITLES: Record<CvDocumentSection, string> = {
  summary: "Summary",
  experience: "Experience",
  languages: "Languages",
  skills: "Skills",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
};

/**
 * Joins the keywords of one skill category. U+00B7 MIDDLE DOT with a space
 * each side — NOT U+2022 BULLET, and never a comma.
 */
export const CV_KEYWORD_SEPARATOR = " · ";

/** Sits between a degree and its field of study on the education line. */
export const CV_EDUCATION_DEGREE_JOINER = " in ";

/**
 * Between the two ends of a date range. A space, an ASCII hyphen-minus, a
 * space — the theme's `date_range: "START_DATE - END_DATE"`, NOT RenderCV's
 * own en-dash default.
 */
export const CV_DATE_RANGE_SEPARATOR = " - ";

/** What an entry with no finish prints instead of a second date. Lowercase. */
export const CV_DATE_PRESENT = "present";

/**
 * The date text of one experience or education entry, character for character
 * as the PDF prints it: `02/2023 - 02/2024`, or `02/2024 - present` with no
 * finish.
 *
 * A fifth pinned twin, alongside the section order, the keyword separator, the
 * category colon and the degree joiner. The server side is RenderCV formatting
 * `start_date`/`end_date` through the theme's own `single_date`
 * (`MONTH_IN_TWO_DIGITS/YEAR`) and `date_range` tokens plus the English
 * locale's `present`; `show_time_spans_in` is empty, so nothing is appended.
 * Change one side and you change both.
 *
 * A row whose start is not yet a real `YYYY-MM` prints nothing at all, so the
 * live preview never shows a dangling separator while a row is half typed.
 */
export function formatCvDatePeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string {
  const start = isoToMonthYear(startDate);
  if (!start) return "";
  const finish = isoToMonthYear(endDate) || CV_DATE_PRESENT;
  return `${start}${CV_DATE_RANGE_SEPARATOR}${finish}`;
}

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
 * Every field counts, not just the ones that are required — including BOTH
 * ends of the period. The server's `_education_entries` uses the same rule, and
 * a narrower one here would make the whole section vanish from the LIVE preview
 * while a user is part-way through a row — they fill the dates, and the heading
 * they were looking at disappears. `visibleSkillCategories` above answers the
 * same question the same way.
 */
export function visibleEducation(education: CvEducation[]): CvEducation[] {
  return education.filter(
    (entry) =>
      entry.institution.trim() !== "" ||
      entry.degree.trim() !== "" ||
      (entry.area ?? "").trim() !== "" ||
      (entry.start ?? "").trim() !== "" ||
      (entry.end ?? "").trim() !== "",
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

/* -------------------------------------------------------------------------
 * The leaves.
 *
 * ONE copy of every fragment of the typeset CV, composed twice: by
 * `CvDocument`, which pours them into one continuous `<section>` per section,
 * and by `buildCvDocumentBlocks` below, which flattens them into the atoms the
 * paginated preview distributes across A4 sheets. Two containers, one content —
 * so the continuous render and the paginated one cannot drift.
 *
 * Every leaf is raw `neutral-*`/`blue-700`, never a semantic token: this is a
 * print artefact that must look identical in light and dark mode.
 * ---------------------------------------------------------------------- */

/** Middot separator for the contact line. Decorative. */
function Dot() {
  return (
    <span aria-hidden className="text-neutral-400">
      •
    </span>
  );
}

/**
 * Name, headline and contact line.
 *
 * TIGHT: the three sit on consecutive lines with no rule and no gap between
 * them, as the template prints them.
 */
export function CvIdentityHeader({ cv }: { cv: CvDocumentData }) {
  return (
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
  );
}

/** The ruled section heading. Level 3, whichever container it lands in. */
export function CvSectionHeading({ title }: { title: string }) {
  return (
    <h3 className="border-b border-neutral-300 pb-1 text-center text-[13px] font-semibold tracking-wide text-neutral-900 uppercase">
      {title}
    </h3>
  );
}

/** The whole summary paragraph. Atomic: it is never split mid-sentence. */
export function CvSummaryText({ summary }: { summary: string }) {
  return (
    <p className="text-[11.5px] leading-relaxed text-neutral-700">{summary}</p>
  );
}

/**
 * One role: company, location, role, period, company description and the WHOLE
 * bullet list. Atomic — the bullets never leave their role.
 */
export function CvExperienceEntry({ entry }: { entry: CvExperience }) {
  // A half-typed row prints no date at all, so the span is guarded rather than
  // left to render an empty box beside the role.
  const period = formatCvDatePeriod(entry.start, entry.end);
  const bullets = entry.bullets.filter(Boolean);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-neutral-800">
          {entry.company}
        </p>
        {entry.location ? (
          <span className="shrink-0 text-[10.5px] text-neutral-600">
            {entry.location}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11.5px] font-medium text-neutral-900">
          {entry.role}
        </p>
        {period ? (
          <span className="shrink-0 text-[10.5px] text-neutral-600">
            {period}
          </span>
        ) : null}
      </div>
      {entry.company_description ? (
        <p className="mt-0.5 text-[10.5px] text-neutral-600 italic">
          {entry.company_description}
        </p>
      ) : null}
      {bullets.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-neutral-700">
          {bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Three columns, filled from the LEFT at any count, and the level said in
 * words. No proficiency meter: the template prints none, so neither does the
 * preview. The whole grid is ONE atom — a language list is short, and splitting
 * a grid across sheets would strand a column.
 */
export function CvLanguagesGrid({ languages }: { languages: CvLanguage[] }) {
  return (
    <ul className="grid grid-cols-3 gap-x-6 gap-y-1 text-[11px]">
      {languages.map((language) => (
        <li key={language.id} className="flex items-baseline gap-1.5">
          <span className="font-semibold text-neutral-900">
            {language.name}
          </span>
          <span className="text-neutral-600">{language.level}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One CATEGORY: a bold heading line, then its keywords on the line under it
 * joined by a middle dot.
 */
export function CvSkillCategoryBlock({ entry }: { entry: CvSkillCategory }) {
  return (
    <div className="text-[11px]">
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
  );
}

/** Three lines, always in this order: name, link, description. */
export function CvProjectBlock({ project }: { project: CvProject }) {
  return (
    <div className="text-[11px]">
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
  );
}

/** Institution and period on one line, the degree phrase under it. */
export function CvEducationEntry({ entry }: { entry: CvEducation }) {
  const period = formatCvDatePeriod(entry.start, entry.end);
  const degreeLine = educationDegreeLine(entry);

  return (
    <div className="text-[11px]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-neutral-900">{entry.institution}</p>
        {period ? (
          <span className="shrink-0 text-[10.5px] text-neutral-600">
            {period}
          </span>
        ) : null}
      </div>
      {degreeLine ? <p className="text-neutral-700">{degreeLine}</p> : null}
    </div>
  );
}

/**
 * The list box the certification lines sit in. The paginated renderer gives
 * each line its OWN list so a sheet break falls between two `<li>`s and never
 * inside one; the continuous document puts them all in a single list. Same box,
 * same type, either way.
 */
export function CvCertificationList({ children }: { children: ReactNode }) {
  return <ul className="space-y-1 text-[11px] text-neutral-700">{children}</ul>;
}

/**
 * One certification line.
 *
 * The NAME is the bold half. The server emits `**name** issuer`
 * (`_labelled_line`) and the owner's reference CV prints it that way; this used
 * to be the other way round, which read as though the issuer were the
 * qualification.
 */
export function CvCertificationItem({
  certification,
}: {
  certification: CvCertification;
}) {
  return (
    <li>
      <span className="font-semibold text-neutral-900">
        {certification.name}
      </span>
      {" — "}
      <span className="text-neutral-600">{certification.issuer}</span>
    </li>
  );
}

/* -------------------------------------------------------------------------
 * The block contract.
 * ---------------------------------------------------------------------- */

/** What one atom of the document is. Drives nothing but readability and tests. */
export type CvBlockKind =
  | "identity"
  | "section-heading"
  | "summary"
  | "experience-entry"
  | "languages"
  | "skill-category"
  | "project"
  | "education-entry"
  | "certification";

/**
 * One ATOM of the typeset CV — the smallest run of content a sheet break may
 * fall either side of, and never inside.
 *
 * The page engine consumes an ordered `CvDocumentBlock[]` and nothing else: it
 * measures `node`, adds `spacingBefore` when the block is not the first on its
 * sheet, and honours `keepWithNext`. It never inspects the CV.
 */
export interface CvDocumentBlock {
  /** Stable across renders. React key AND the measurement cache key. */
  key: string;
  kind: CvBlockKind;
  /** The section this atom belongs to; `null` for the identity header. */
  section: CvDocumentSection | null;
  /**
   * `true` when this atom must not be the LAST on a sheet. Section headings
   * carry it: a ruled heading alone at the foot of a page with its first entry
   * overleaf is the ugliest failure of naive pagination.
   */
  keepWithNext: boolean;
  /**
   * The gap above this atom, in CSS pixels, when it is NOT the first on its
   * sheet — the `mt-5` / `pt-2` / `space-y-*` the continuous document gets from
   * its wrappers. The first atom on a sheet drops it, so no page ever opens
   * with a dangling top margin.
   */
  spacingBefore: number;
  node: ReactNode;
}

/** `mt-5` on `<section>` in the continuous document. */
const SECTION_HEADING_GAP = 20;
/** `pt-2` under the ruled heading, before the section's first atom. */
const AFTER_HEADING_GAP = 8;
/** `space-y-3` between experience entries. */
const EXPERIENCE_ENTRY_GAP = 12;
/** `space-y-2` between skill categories, projects and education entries. */
const ENTRY_GAP = 8;
/** `space-y-1` between certification lines. */
const CERTIFICATION_GAP = 4;

/**
 * The typeset CV as an ordered list of atoms, ready to be flowed across A4
 * sheets.
 *
 * Pure, and the SAME content `CvDocument` renders continuously — the leaves
 * above are shared. The only difference is the container: here the wrappers'
 * vertical rhythm is carried as `spacingBefore` numbers instead of
 * `mt-5`/`pt-2`/`space-y-*` classes, because a `space-y-*` cannot span a page
 * break.
 */
export function buildCvDocumentBlocks(cv: CvDocumentData): CvDocumentBlock[] {
  const populated = new Set(getPopulatedCvSections(cv));
  const blocks: CvDocumentBlock[] = [];

  const heading = (section: CvDocumentSection) => {
    blocks.push({
      key: `${section}:heading`,
      kind: "section-heading",
      section,
      keepWithNext: true,
      spacingBefore: SECTION_HEADING_GAP,
      node: <CvSectionHeading title={CV_SECTION_TITLES[section]} />,
    });
  };

  blocks.push({
    key: "identity",
    kind: "identity",
    section: null,
    keepWithNext: false,
    spacingBefore: 0,
    node: <CvIdentityHeader cv={cv} />,
  });

  if (populated.has("summary")) {
    heading("summary");
    blocks.push({
      key: "summary:text",
      kind: "summary",
      section: "summary",
      keepWithNext: false,
      spacingBefore: AFTER_HEADING_GAP,
      node: <CvSummaryText summary={cv.summary} />,
    });
  }

  if (populated.has("experience")) {
    heading("experience");
    cv.experience.forEach((entry, index) => {
      blocks.push({
        key: `experience:${entry.id}`,
        kind: "experience-entry",
        section: "experience",
        keepWithNext: false,
        spacingBefore: index === 0 ? AFTER_HEADING_GAP : EXPERIENCE_ENTRY_GAP,
        node: <CvExperienceEntry entry={entry} />,
      });
    });
  }

  if (populated.has("languages")) {
    heading("languages");
    blocks.push({
      key: "languages:grid",
      kind: "languages",
      section: "languages",
      keepWithNext: false,
      spacingBefore: AFTER_HEADING_GAP,
      node: <CvLanguagesGrid languages={cv.languages} />,
    });
  }

  if (populated.has("skills")) {
    heading("skills");
    visibleSkillCategories(cv.skills).forEach((entry, index) => {
      blocks.push({
        key: `skills:${entry.id}`,
        kind: "skill-category",
        section: "skills",
        keepWithNext: false,
        spacingBefore: index === 0 ? AFTER_HEADING_GAP : ENTRY_GAP,
        node: <CvSkillCategoryBlock entry={entry} />,
      });
    });
  }

  if (populated.has("projects")) {
    heading("projects");
    cv.projects.forEach((project, index) => {
      blocks.push({
        key: `projects:${project.id}`,
        kind: "project",
        section: "projects",
        keepWithNext: false,
        spacingBefore: index === 0 ? AFTER_HEADING_GAP : ENTRY_GAP,
        node: <CvProjectBlock project={project} />,
      });
    });
  }

  if (populated.has("education")) {
    heading("education");
    visibleEducation(cv.education).forEach((entry, index) => {
      blocks.push({
        key: `education:${entry.id}`,
        kind: "education-entry",
        section: "education",
        keepWithNext: false,
        spacingBefore: index === 0 ? AFTER_HEADING_GAP : ENTRY_GAP,
        node: <CvEducationEntry entry={entry} />,
      });
    });
  }

  if (populated.has("certifications")) {
    heading("certifications");
    cv.certifications.forEach((certification, index) => {
      blocks.push({
        key: `certifications:${certification.id}`,
        kind: "certification",
        section: "certifications",
        keepWithNext: false,
        spacingBefore: index === 0 ? AFTER_HEADING_GAP : CERTIFICATION_GAP,
        // Its own list box, so a sheet break falls BETWEEN two lines and the
        // markup stays valid on both sheets.
        node: (
          <CvCertificationList>
            <CvCertificationItem certification={certification} />
          </CvCertificationList>
        ),
      });
    });
  }

  return blocks;
}
