/**
 * The CV copy diff (KODI-017 part 2 + 3).
 *
 * Pure — no React, no I/O — and shared in SPIRIT with the server: both sides
 * implement "Diff design (PINNED)" and "Diff semantics shared by web and
 * server (PINNED)" from the slice brief independently, and `cv-diff.fixtures.
 * test.ts` proves this implementation's `diffCv()` output matches the
 * server's for every case in `applika/fixtures/cv-diff/*.json`.
 *
 * `computeCvDiff()` is the richer internal shape `use-cv-diff.tsx` builds the
 * editor's marker slots from (per-field before/after, added/removed items
 * with a baseline position, keyword sets); `diffCv()` reduces it to the
 * canonical flat shape the PINNED contract and the fixtures pin:
 *
 *   { total, sections: {identity, links, summary, experience, languages,
 *     skills, projects, education, certifications}, changes: [...] }
 *
 * Matching: list items are matched by their preserved client `id`, never by
 * position — a pure reorder is not a change. Normalisation: `null`,
 * `undefined` and `""` compare equal; everything else is exact string
 * equality. A string list (bullets) compares as ONE whole-value change;
 * skill keywords compare as a SET per category, so each added or removed
 * keyword is its own change.
 */

import type {
  CvCertification,
  CvEducation,
  CvExperience,
  CvFormValues,
  CvLanguage,
  CvLink,
  CvProject,
  CvScalars,
  CvSections,
  CvSkillCategory,
} from "@/components/base-cvs/types";
import type { CvFormListSectionId } from "@/components/base-cvs/cv-form-diff";
import type { CvFormSectionId } from "@/components/base-cvs/cv-form-sections";

/** The baseline shape: exactly the copy's own content fields. */
export type CvDiffSnapshot = CvScalars & CvSections;

export type CvDiffChangeKind =
  | "changed"
  | "added"
  | "removed"
  | "keyword_added"
  | "keyword_removed";

/** The canonical section keys, shared with the server's JSON (PINNED). */
export type CvDiffSectionId = CvFormSectionId;

/** One entry of the canonical `changes` array (PINNED shape). */
export interface CvDiffChange {
  kind: CvDiffChangeKind;
  section: CvDiffSectionId;
  path: string;
  before: unknown;
  after: unknown;
}

/** The canonical diff JSON both the web and the server produce (PINNED). */
export interface CvDiffResult {
  total: number;
  sections: Record<CvDiffSectionId, number>;
  changes: CvDiffChange[];
}

/** Every keyword this category gained or lost, by its client item id. */
export interface CvDiffKeywordChanges {
  added: string[];
  removed: string[];
}

/** A baseline-only item: still there for `Restore`, with where it used to sit. */
export interface CvDiffRemovedItem<T = unknown> {
  id: string;
  item: T;
  /** Current-list index the item sat before, among the items that survived. */
  at: number;
}

interface CvDiffListInternal {
  changes: CvDiffChange[];
  addedIds: Set<string>;
  removedList: CvDiffRemovedItem[];
  /** Skills only: keyword add/remove per category item id. */
  keywordChangesByItem?: Map<string, CvDiffKeywordChanges>;
}

/** Everything `use-cv-diff.tsx` needs to build the editor's marker slots. */
export interface CvDiffDetail {
  canonical: CvDiffResult;
  /** Identity + summary scalar changes, keyed by their canonical `path`. */
  identity: CvDiffChange[];
  lists: Record<CvFormListSectionId, CvDiffListInternal>;
}

/** `null`, `undefined` and `""` are the same absence of a value. */
function normalise(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string" && value === "") return null;
  return value;
}

function eq(a: unknown, b: unknown): boolean {
  return normalise(a) === normalise(b);
}

function arrEq(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((value, index) => eq(value, right[index]));
}

/** The `identity` (name, full_name, headline, location, email, phone) plus `summary`. */
const IDENTITY_FIELDS = [
  "name",
  "full_name",
  "headline",
  "location",
  "email",
  "phone",
] as const;

function diffIdentity(
  baseline: CvDiffSnapshot,
  current: Partial<CvFormValues>,
): CvDiffChange[] {
  const changes: CvDiffChange[] = [];
  for (const field of IDENTITY_FIELDS) {
    if (!eq(baseline[field], current[field])) {
      changes.push({
        kind: "changed",
        section: "identity",
        path: field,
        before: normalise(baseline[field]),
        after: normalise(current[field]),
      });
    }
  }
  if (!eq(baseline.summary, current.summary)) {
    changes.push({
      kind: "changed",
      section: "summary",
      path: "summary",
      before: normalise(baseline.summary),
      after: normalise(current.summary),
    });
  }
  return changes;
}

interface ListItem {
  id: string;
  [key: string]: unknown;
}

/** Generic list-section diff: matched by `id`, never by position. */
function diffList<T extends ListItem>(
  section: CvFormListSectionId,
  baseline: readonly T[] | undefined,
  current: readonly T[] | undefined,
  scalarFields: readonly string[],
  listFields: readonly string[] = [],
): CvDiffListInternal {
  const baseArr = baseline ?? [];
  const curArr = current ?? [];
  const baseById = new Map(baseArr.map((item) => [item.id, item]));
  const curById = new Map(curArr.map((item) => [item.id, item]));
  const changes: CvDiffChange[] = [];
  const addedIds = new Set<string>();
  const removedList: CvDiffRemovedItem[] = [];

  for (const item of curArr) {
    const base = baseById.get(item.id);
    if (!base) {
      addedIds.add(item.id);
      changes.push({
        kind: "added",
        section,
        path: `${section}:${item.id}`,
        before: null,
        after: item,
      });
      continue;
    }
    for (const field of scalarFields) {
      if (!eq(base[field], item[field])) {
        changes.push({
          kind: "changed",
          section,
          path: `${section}:${item.id}.${field}`,
          before: normalise(base[field]),
          after: normalise(item[field]),
        });
      }
    }
    for (const field of listFields) {
      const baseValue = (base[field] as string[] | undefined) ?? [];
      const curValue = (item[field] as string[] | undefined) ?? [];
      if (!arrEq(baseValue, curValue)) {
        changes.push({
          kind: "changed",
          section,
          path: `${section}:${item.id}.${field}`,
          before: baseValue,
          after: curValue,
        });
      }
    }
  }

  let survivors = 0;
  for (const item of baseArr) {
    if (curById.has(item.id)) {
      survivors += 1;
      continue;
    }
    removedList.push({ id: item.id, item, at: survivors });
    changes.push({
      kind: "removed",
      section,
      path: `${section}:${item.id}`,
      before: item,
      after: null,
    });
  }

  return { changes, addedIds, removedList };
}

/** Skills: the category name is a scalar field; the keywords are a SET. */
function diffSkills(
  baseline: readonly CvSkillCategory[] | undefined,
  current: readonly CvSkillCategory[] | undefined,
): CvDiffListInternal {
  const baseArr = baseline ?? [];
  const curArr = current ?? [];
  const baseById = new Map(baseArr.map((item) => [item.id, item]));
  const curById = new Map(curArr.map((item) => [item.id, item]));
  const changes: CvDiffChange[] = [];
  const addedIds = new Set<string>();
  const removedList: CvDiffRemovedItem[] = [];
  const keywordChangesByItem = new Map<string, CvDiffKeywordChanges>();

  for (const item of curArr) {
    const base = baseById.get(item.id);
    if (!base) {
      addedIds.add(item.id);
      changes.push({
        kind: "added",
        section: "skills",
        path: `skills:${item.id}`,
        before: null,
        after: item,
      });
      continue;
    }
    if (!eq(base.category, item.category)) {
      changes.push({
        kind: "changed",
        section: "skills",
        path: `skills:${item.id}.category`,
        before: normalise(base.category),
        after: normalise(item.category),
      });
    }

    const baseKeywords = base.keywords ?? [];
    const curKeywords = item.keywords ?? [];
    const baseSet = new Set(baseKeywords);
    const curSet = new Set(curKeywords);
    const added: string[] = [];
    const removed: string[] = [];
    for (const keyword of curKeywords) {
      if (!baseSet.has(keyword)) {
        added.push(keyword);
        changes.push({
          kind: "keyword_added",
          section: "skills",
          path: `skills:${item.id}.keywords:${keyword}`,
          before: null,
          after: keyword,
        });
      }
    }
    for (const keyword of baseKeywords) {
      if (!curSet.has(keyword)) {
        removed.push(keyword);
        changes.push({
          kind: "keyword_removed",
          section: "skills",
          path: `skills:${item.id}.keywords:${keyword}`,
          before: keyword,
          after: null,
        });
      }
    }
    if (added.length || removed.length) {
      keywordChangesByItem.set(item.id, { added, removed });
    }
  }

  let survivors = 0;
  for (const item of baseArr) {
    if (curById.has(item.id)) {
      survivors += 1;
      continue;
    }
    removedList.push({ id: item.id, item, at: survivors });
    changes.push({
      kind: "removed",
      section: "skills",
      path: `skills:${item.id}`,
      before: item,
      after: null,
    });
  }

  return { changes, addedIds, removedList, keywordChangesByItem };
}

/**
 * The rich internal diff `use-cv-diff.tsx` builds the editor's marker slots
 * from. `diffCv()` below is `computeCvDiff(...).canonical`.
 */
export function computeCvDiff(
  baseline: CvDiffSnapshot,
  current: Partial<CvFormValues>,
): CvDiffDetail {
  const identity = diffIdentity(baseline, current);

  const links = diffList<CvLink & ListItem>(
    "links",
    baseline.links as (CvLink & ListItem)[],
    current.links as (CvLink & ListItem)[] | undefined,
    ["label", "url"],
  );
  const experience = diffList<CvExperience & ListItem>(
    "experience",
    baseline.experience as (CvExperience & ListItem)[],
    current.experience as (CvExperience & ListItem)[] | undefined,
    ["company", "company_description", "role", "start", "end", "location"],
    ["bullets"],
  );
  const projects = diffList<CvProject & ListItem>(
    "projects",
    baseline.projects as (CvProject & ListItem)[],
    current.projects as (CvProject & ListItem)[] | undefined,
    ["name", "description", "link", "link_label"],
  );
  const education = diffList<CvEducation & ListItem>(
    "education",
    baseline.education as (CvEducation & ListItem)[],
    current.education as (CvEducation & ListItem)[] | undefined,
    ["institution", "degree", "area", "start", "end"],
  );
  const certifications = diffList<CvCertification & ListItem>(
    "certifications",
    baseline.certifications as (CvCertification & ListItem)[],
    current.certifications as (CvCertification & ListItem)[] | undefined,
    ["name", "issuer"],
  );
  const languages = diffList<CvLanguage & ListItem>(
    "languages",
    baseline.languages as (CvLanguage & ListItem)[],
    current.languages as (CvLanguage & ListItem)[] | undefined,
    ["name", "level"],
  );
  const skills = diffSkills(baseline.skills, current.skills);

  const lists: Record<CvFormListSectionId, CvDiffListInternal> = {
    links,
    skills,
    experience,
    projects,
    education,
    certifications,
    languages,
  };

  const identityCount = identity.filter((c) => c.section === "identity").length;
  const summaryCount = identity.filter((c) => c.section === "summary").length;

  const sections: Record<CvDiffSectionId, number> = {
    identity: identityCount,
    summary: summaryCount,
    links: links.changes.length,
    skills: skills.changes.length,
    experience: experience.changes.length,
    projects: projects.changes.length,
    education: education.changes.length,
    certifications: certifications.changes.length,
    languages: languages.changes.length,
  };

  const changes = [
    ...identity,
    ...links.changes,
    ...experience.changes,
    ...projects.changes,
    ...education.changes,
    ...certifications.changes,
    ...languages.changes,
    ...skills.changes,
  ];

  const total = changes.length;

  return { canonical: { total, sections, changes }, identity, lists };
}

/**
 * `diffCv(baseline, current)` — the pure function the slice brief names.
 * Returns the canonical shape both the web and the server produce; see
 * `computeCvDiff` for the richer shape the editor's diff slots are built from.
 */
export function diffCv(
  baseline: CvDiffSnapshot,
  current: Partial<CvFormValues>,
): CvDiffResult {
  return computeCvDiff(baseline, current).canonical;
}

/**
 * Sorts a canonical `changes` array by path then kind — the fixtures compare
 * order-insensitively (PINNED), so both sides sort before asserting equality.
 */
export function sortCvDiffChanges(
  changes: readonly CvDiffChange[],
): CvDiffChange[] {
  return [...changes].sort((a, b) =>
    a.path === b.path
      ? a.kind.localeCompare(b.kind)
      : a.path.localeCompare(b.path),
  );
}
