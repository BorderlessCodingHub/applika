import { liveCopy, word } from "@/i18n/translator";

/**
 * The applications list's words, in the active language (`applications.*`).
 * Every field is a getter, so a read returns the current language; the
 * components rendering them subscribe (`useLocale`/`useTranslations`), so a
 * switch re-renders them. Never spread a copy object: it would freeze the words.
 */
export const APPLICATIONS_PAGE_COPY = liveCopy("applications.page", [
  "title",
  "subtitle",
  "newApplication",
  "newWithCv",
  "applicationsTab",
  "draftsTab",
  "archivedSubtitle",
  "searchPlaceholder",
  "searchLabel",
  "statusFilterLabel",
  "allStatuses",
  "advancedFilters",
  "clearFilters",
  "emptyTitle",
  "emptyAction",
  /** `?focus=` (R-011, KODI-038): the application isn't in the list shown. */
  "focusNotInCycle",
]);

export function foundApplicationsLabel(count: number): string {
  return word("applications.found", { count });
}

/** The status pill's words: the open status, and its screen-reader prefix. */
export const APPLICATION_STATUS_COPY = liveCopy("applications.status", [
  "active",
  "srPrefix",
]);

export const APPLICATION_ACTION_COPY = liveCopy("applications.actions", [
  "edit",
  "delete",
  "cv",
  "details",
]);

/** "<role> at <company>"; both are the user's own text, as sent. */
export function applicationName(role: string, company: string): string {
  return word("applications.name", { role, company });
}

export const APPLICATION_DETAIL_LABELS = liveCopy("applications.detail", [
  "platform",
  "source",
  "date",
  "experience",
  "workMode",
  "country",
  "salaryRange",
  "expectedSalary",
  "jobPosting",
  "jobPostingLink",
  "notes",
]);
