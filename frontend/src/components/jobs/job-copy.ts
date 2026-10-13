import { formatDistanceStrict } from "date-fns";

import { draftResumeHref } from "@/components/application-drafts/draft-copy";
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

export const JOBS_COPY = {
  title: "Jobs",
  subtitle:
    "Remote jobs from Himalayas and RemoteOK, matched against your master CVs.",
  invitation: "Create a master CV to see how well you fit each job",
  emptyTitle: "No jobs yet",
  emptyBody: "New jobs arrive every hour.",
  noMatchesTitle: "No jobs match these filters",
  noMatchesBody: "Try fewer tags, a lower minimum fit or a longer time window.",
  clearFilters: "Clear filters",
  clearAllFilters: "Clear all filters",
  loadErrorTitle: "Could not load jobs",
  retry: "Retry",
  pagerLabel: "Job list pages",
  previous: "Previous",
  next: "Next",
  previousPage: "Previous page",
  nextPage: "Next page",

  start: "Start application",
  dismiss: "Dismiss",
  restore: "Restore",
  dismissed: "Dismissed",
  draft: "Draft",
  applied: "Applied",

  filtersLabel: "Filter jobs",
  searchLabel: "Search jobs",
  searchPlaceholder: "Title, company or description",
  sourceLabel: "Source",
  allSources: "All sources",
  sortLabel: "Sort",
  sortNewest: "Newest",
  sortFit: "Best fit",
  moreFilters: "More filters",
  tagsLabel: "Tags",
  tagsPlaceholder: "Add a tag, then press Enter",
  tagsHint: "Jobs that carry every tag. Case-sensitive.",
  tagsFull: "You can filter by up to 10 tags.",
  minFitLabel: "Minimum fit",
  anyFit: "Any fit",
  minFitNeedsCv: "Needs a master CV.",
  postedWithinLabel: "Published within",
  anyTime: "Any time",
  showDismissed: "Show dismissed",

  backToJobs: "Back to jobs",
  descriptionTitle: "Description",
  emptyDescription: "This job has no description.",
  fitTitle: "Your fit",
  fitHint: "How each of your master CVs covers this job's keywords.",
  noFit: "No fit yet",
  noFitBody: "This job has no keywords to compare yet.",
  matched: "Matched",
  missing: "Missing",
  noneMatched: "None of this job's keywords are in this CV.",
  noneMissing: "This CV covers every keyword.",
  notListedTitle: "This job is no longer listed",
  notListedBody:
    "Jobs leave the list 15 days after they are published, or sooner when their source removes them.",
  loadJobErrorTitle: "Could not load this job",
  loadingJob: "Loading this job",
  loadingJobs: "Loading jobs",
  companyWebsite: "Company website",
  inactiveNote:
    "This job is no longer listed. You still see it because you started an application from it.",

  startTitle: "Start an application",
  cvLegend: "Master CV",
  cvHint: "The draft gets a copy of it. The master CV never changes.",
  noCvOption: "Without a CV",
  noCvHint: "Pick a master CV on the next page.",
  noCvs: "You have no master CV yet. The draft starts without a CV copy.",
  copyLegend: "CV copy",
  verbatim: "Verbatim copy",
  verbatimHint: "An exact copy of the master CV.",
  keywords: "Tailor by keywords",
  keywordsHint:
    "Puts the skills and bullets that match this job's keywords first. No text is added, removed or rewritten.",
  create: "Create draft",
  cancel: "Cancel",
  close: "Close",
  alreadyApplied: "You already have an application for this job",
  openDraft: "Open draft",
  openApplication: "Open application",

  savedSearches: "Saved searches",
  savedEmptyTitle: "No saved searches yet",
  savedEmptyBody:
    "Save the search, filters and sort you use often, then apply them in one click.",
  savedLoadError: "Could not load your saved searches.",
  saveCurrent: "Save current search",
  saveDialogDescription:
    "Saves your search text, filters and sort under a name.",
  saveSubmit: "Save search",
  renameTitle: "Rename saved search",
  renameSubmit: "Rename",
  nameLabel: "Name",
  nameRequired: "Give this search a name",
  nameTooLong: "Use 100 characters or fewer",
  deleteTitle: "Delete this saved search?",
  deleteConfirm: "Delete search",
} as const;

export function startDescription(title: string, company: string): string {
  return `Creates a draft from ${title} at ${company}. You finish it on the next page.`;
}

export function viewOnSourceLabel(sourceName: string): string {
  return `View on ${sourceName}`;
}

export function moreTagsLabel(hidden: number): string {
  return `+${hidden} more`;
}

export function removeTagLabel(tag: string): string {
  return `Remove tag ${tag}`;
}

export function renameSearchLabel(name: string): string {
  return `Rename ${name}`;
}

export function deleteSearchLabel(name: string): string {
  return `Delete ${name}`;
}

export function deleteSearchDescription(name: string): string {
  return `"${name}" leaves your saved searches. Jobs and applications are not affected.`;
}

export function renameSearchDescription(name: string): string {
  return `Renames "${name}". Its search, filters and sort stay the same.`;
}

/** Shown under the disabled "Save current search" at the cap. */
export function savedCapLabel(max = JOB_SEARCHES_MAX): string {
  return `You can keep up to ${max} saved searches`;
}

export function savedCountLabel(count: number, max = JOB_SEARCHES_MAX): string {
  return `${count} of ${max}`;
}

export function jobCountLabel(total: number): string {
  return `${total.toLocaleString("en")} ${total === 1 ? "job" : "jobs"}`;
}

export function pageLabel(page: number, totalPages: number): string {
  return `Page ${page} of ${totalPages}`;
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
  return `Fit ${clampFit(score)}%`;
}

export const MIN_FIT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;
export const POSTED_WITHIN_OPTIONS = [1, 3, 7, 14] as const;

export function minFitOptionLabel(value: number): string {
  return `${value}% or more`;
}

export function postedWithinOptionLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/** `null` for a missing or unreadable date; under a minute (or a skewed future date) is "just now". */
export function publishedLabel(
  postedAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!postedAt) return null;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return null;
  if (now.getTime() - posted.getTime() < 60_000) return "just now";
  return formatDistanceStrict(posted, now, {
    addSuffix: true,
    roundingMethod: "floor",
  });
}

export function publishedTitle(postedAt: string | null): string | undefined {
  if (!postedAt) return undefined;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return undefined;
  return posted.toLocaleString("en", {
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
    filters.sort === "fit" ? JOBS_COPY.sortFit : JOBS_COPY.sortNewest,
  ];
  if (filters.search) parts.push(`"${filters.search}"`);
  if (filters.source) parts.push(jobSourceName(filters.source));
  if (filters.tags.length > 0) parts.push(filters.tags.join(", "));
  if (filters.min_fit != null) parts.push(`Fit ${filters.min_fit}%+`);
  if (filters.posted_within_days != null) {
    parts.push(postedWithinOptionLabel(filters.posted_within_days));
  }
  if (filters.include_dismissed) parts.push("With dismissed");
  return parts.join(" · ");
}
