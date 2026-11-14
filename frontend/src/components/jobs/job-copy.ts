import { formatDistanceStrict } from "date-fns";
import { useLocale } from "next-intl";

import { draftResumeHref } from "@/components/application-drafts/draft-copy";
import { dateFnsLocale } from "@/i18n/date-locale";
import { intlLocale } from "@/i18n/intl-locale";
import { getTranslatorLocale, liveCopy, word } from "@/i18n/translator";
import { JOB_SEARCHES_MAX } from "@/services/types/job-searches";
import {
  DEFAULT_JOB_FILTERS,
  JOB_SOURCES,
  type JobApplicationRef,
  type JobFilters,
} from "@/services/types/jobs";

export const JOBS_HREF = "/jobs";
export const NEW_MASTER_CV_HREF = "/cvs/new";

export function jobViewHref(jobId: string): string {
  return `/jobs/view?id=${encodeURIComponent(jobId)}`;
}

/** R-030: a draft resumes on the new-with-cv page, a finished one opens in the list. */
export function jobApplicationHref(application: JobApplicationRef): string {
  return application.is_draft
    ? draftResumeHref(application.id)
    : `/applications?focus=${encodeURIComponent(application.id)}`;
}

/**
 * The job board's words, in the active language (`jobs.*`). Every field is a
 * getter, so a read returns the current language. Components rendering them
 * call `useJobsCopy()` (or `useLocale`), which subscribes, so a language
 * switch re-renders them. Never spread it, never destructure it at module
 * scope: that would freeze the words.
 */
export const JOBS_COPY = liveCopy("jobs", [
  "title",
  "subtitle",
  "subtitleNoCvs",
  "invitation",
  "emptyTitle",
  "emptyBody",
  "noMatchesTitle",
  "noMatchesBody",
  "noMatchesBodyNoCvs",
  "clearFilters",
  "clearAllFilters",
  "loadErrorTitle",
  "retry",
  "pagerLabel",
  "previous",
  "next",
  "previousPage",
  "nextPage",
  "start",
  "dismiss",
  "restore",
  "dismissed",
  "draft",
  "applied",
  "filtersLabel",
  "searchLabel",
  "searchPlaceholder",
  "sourceLabel",
  "allSources",
  "sortLabel",
  "sortNewest",
  "sortFit",
  "moreFilters",
  "tagsLabel",
  "tagsPlaceholder",
  "tagsHint",
  "tagsFull",
  "minFitLabel",
  "anyFit",
  "minFitNeedsCv",
  "postedWithinLabel",
  "anyTime",
  "showDismissed",
  "backToJobs",
  "descriptionTitle",
  "emptyDescription",
  "fitTitle",
  "fitHint",
  "noFit",
  "noFitBody",
  "matched",
  "missing",
  "noneMatched",
  "noneMissing",
  "notListedTitle",
  "notListedBody",
  "loadJobErrorTitle",
  "loadingJob",
  "loadingJobs",
  "companyWebsite",
  "inactiveNote",
  "startTitle",
  "cvLegend",
  "cvHint",
  "noCvOption",
  "noCvHint",
  "noCvs",
  "copyLegend",
  "verbatim",
  "verbatimHint",
  "keywords",
  "keywordsHint",
  "create",
  "cancel",
  "close",
  "alreadyApplied",
  "openDraft",
  "openApplication",
  "savedSearches",
  "savedEmptyTitle",
  "savedEmptyBody",
  "savedLoadError",
  "saveCurrent",
  "saveDialogDescription",
  "saveSubmit",
  "renameTitle",
  "renameSubmit",
  "nameLabel",
  "nameRequired",
  "nameTooLong",
  "deleteTitle",
  "deleteConfirm",
  "justNow",
  "withDismissed",
  "unknownError",
  "summaryBestFit",
]);

/** `JOBS_COPY` for render: subscribes to the language, so a switch re-renders the caller. */
export function useJobsCopy(): typeof JOBS_COPY {
  useLocale();
  return JOBS_COPY;
}

export function startDescription(title: string, company: string): string {
  return word("jobs.startDescription", { title, company });
}

export function viewOnSourceLabel(sourceName: string): string {
  return word("jobs.viewOnSource", { source: sourceName });
}

export function moreTagsLabel(hidden: number): string {
  return word("jobs.moreTags", { count: hidden });
}

export function removeTagLabel(tag: string): string {
  return word("jobs.removeTag", { tag });
}

export function renameSearchLabel(name: string): string {
  return word("jobs.renameSearch", { name });
}

export function deleteSearchLabel(name: string): string {
  return word("jobs.deleteSearch", { name });
}

export function deleteSearchDescription(name: string): string {
  return word("jobs.deleteSearchDescription", { name });
}

export function renameSearchDescription(name: string): string {
  return word("jobs.renameSearchDescription", { name });
}

/** Shown under the disabled "Save current search" at the cap. */
export function savedCapLabel(max = JOB_SEARCHES_MAX): string {
  return word("jobs.savedCap", { max });
}

export function savedCountLabel(count: number, max = JOB_SEARCHES_MAX): string {
  return word("jobs.savedCount", { count, max });
}

/** "1,234 jobs" in English, "1.234 vagas" in Portuguese. */
export function jobCountLabel(total: number): string {
  return word("jobs.jobCount", { total });
}

export function pageLabel(page: number, totalPages: number): string {
  return word("jobs.page", { page, totalPages });
}

/** "More filters", or "More filters (2 active)" with advanced filters set. */
export function moreFiltersLabel(active: number): string {
  return active > 0
    ? word("jobs.moreFiltersActive", { count: active })
    : JOBS_COPY.moreFilters;
}

export type FitBand = "strong" | "partial" | "low";

/** Ían's bands: 70 and up strong, 40 and up partial. */
export const FIT_BAND_FLOOR = { strong: 70, partial: 40 } as const;

export function clampFit(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function fitBand(score: number): FitBand {
  const value = clampFit(score);
  if (value >= FIT_BAND_FLOOR.strong) return "strong";
  if (value >= FIT_BAND_FLOOR.partial) return "partial";
  return "low";
}

export function fitLabel(score: number): string {
  return word("jobs.fitLabel", { score: clampFit(score) });
}

export const MIN_FIT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;
export const POSTED_WITHIN_OPTIONS = [1, 3, 7, 14] as const;

export function minFitOptionLabel(value: number): string {
  return word("jobs.minFitOption", { value });
}

export function postedWithinOptionLabel(days: number): string {
  return word("jobs.postedWithinOption", { days });
}

/** `null` for a missing or unreadable date; under a minute (or a skewed future date) is "just now". */
export function publishedLabel(
  postedAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!postedAt) return null;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return null;
  if (now.getTime() - posted.getTime() < 60_000) return JOBS_COPY.justNow;
  return formatDistanceStrict(posted, now, {
    addSuffix: true,
    roundingMethod: "floor",
    locale: dateFnsLocale(getTranslatorLocale()),
  });
}

export function publishedTitle(postedAt: string | null): string | undefined {
  if (!postedAt) return undefined;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return undefined;
  return posted.toLocaleString(intlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Sources send `FULL_TIME`, `full-time` or `Full-Time`; only single-case words are recased. */
export function employmentTypeLabel(raw: string | null): string | null {
  const text = raw?.replaceAll("_", " ").trim();
  if (!text) return null;
  if (text === text.toUpperCase() || text === text.toLowerCase()) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
  return text;
}

export function jobSourceName(code: string): string {
  return JOB_SOURCES.find((source) => source.code === code)?.name ?? code;
}

/** Scraped links are shown only when they are plain http(s). */
export function isHttpUrl(value: string | null | undefined): value is string {
  return !!value && /^https?:\/\//i.test(value.trim());
}

export function isBlankDescription(text: string | null | undefined): boolean {
  return !text?.trim();
}

export function advancedJobFilterCount(filters: JobFilters): number {
  return [
    filters.tags.length > 0,
    filters.min_fit != null,
    filters.posted_within_days != null,
  ].filter(Boolean).length;
}

/** Sort and "Show dismissed" are views, not filters: they survive a clear. */
export function hasAnyJobFilter(filters: JobFilters): boolean {
  return (
    !!filters.search || !!filters.source || advancedJobFilterCount(filters) > 0
  );
}

export function clearJobFilters(filters: JobFilters): JobFilters {
  return {
    ...DEFAULT_JOB_FILTERS,
    sort: filters.sort,
    include_dismissed: filters.include_dismissed,
  };
}

/** One line per saved search: "Best fit · Himalayas · python, django · Fit 60%+ · 7 days". */
export function summarizeJobFilters(filters: JobFilters): string {
  const parts: string[] = [
    filters.sort === "fit" ? JOBS_COPY.summaryBestFit : JOBS_COPY.sortNewest,
  ];
  if (filters.search) parts.push(`"${filters.search}"`);
  if (filters.source) parts.push(jobSourceName(filters.source));
  if (filters.tags.length > 0) parts.push(filters.tags.join(", "));
  if (filters.min_fit != null) {
    parts.push(word("jobs.fitAtLeast", { value: filters.min_fit }));
  }
  if (filters.posted_within_days != null) {
    parts.push(postedWithinOptionLabel(filters.posted_within_days));
  }
  if (filters.include_dismissed) parts.push(JOBS_COPY.withDismissed);
  return parts.join(" · ");
}
