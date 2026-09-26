import { formatDistanceStrict } from "date-fns";
import { isAxiosError } from "axios";

export type DraftStep = "application" | "cv";

/** What stops a draft from being finished, in the order it is listed on screen. */
export type DraftRequirement = "company" | "role" | "platform" | "cv";

export const DRAFT_STEPS: readonly DraftStep[] = ["application", "cv"];

export const DRAFT_REQUIREMENT_ORDER: readonly DraftRequirement[] = [
  "company",
  "role",
  "platform",
  "cv",
];

const REQUIREMENT_LABEL: Record<DraftRequirement, string> = {
  company: "company",
  role: "role",
  platform: "platform",
  cv: "CV copy",
};

export const NEW_WITH_CV_HREF = "/applications/new-with-cv";

export function draftResumeHref(draftId: string): string {
  return `${NEW_WITH_CV_HREF}?id=${encodeURIComponent(draftId)}`;
}

export const DRAFT_COPY = {
  pageTitle: "New application with CV",
  pageSubtitle:
    "Fill in the application, then tailor a copy of one of your master CVs. It saves as a draft once company, role and platform are set.",
  backToApplications: "Back to applications",
  stepsLabel: "Steps",
  steps: {
    application: {
      number: 1,
      title: "Application",
      hint: "Company, role, platform",
    },
    cv: { number: 2, title: "CV", hint: "A copy of a master CV" },
  },
  continueToCv: "Continue to CV",
  cancel: "Cancel",
  back: "Back",
  finish: "Finish",
  saving: "Saving...",
  saved: "Saved",
  notSaved: "Not saved",
  requiredNotSaved: "Not saved: company, role and platform are required",
  retry: "Retry",
  loading: "Loading this draft",
  notFoundTitle: "This draft is not available",
  notFoundBody:
    "It may have been finished or deleted. Finished drafts are in your applications list.",
  loadErrorTitle: "Could not load this draft",
  loadErrorBody: "Something went wrong while opening it.",
  tryAgain: "Try again",
  goToApplications: "Go to applications",
  noMasterCvTitle: "No master CV to copy yet",
  noMasterCvBody:
    "Step 2 starts from a copy of one of your master CVs. Write one first; this draft stays in Drafts on the applications page, ready to resume.",
  noMasterCvCta: "Create your first CV",
} as const;

export const DRAFTS_SECTION_COPY = {
  title: "Drafts",
  emptyTitle: "No drafts yet.",
  description: "Applications you started with a CV. They save as you type.",
  resume: "Resume",
  cvCopy: "CV copy",
  loadError: "Could not load your drafts.",
  retry: "Retry",
  deleteTitle: "Delete this draft?",
  deleteConfirm: "Delete draft",
  cancel: "Cancel",
} as const;

export function stepLabel(step: DraftStep): string {
  const { number, title } = DRAFT_COPY.steps[step];
  return `Step ${number}: ${title}`;
}

/** `Missing: company, role, platform, CV copy`, always in on-screen order. */
export function missingLabel(missing: readonly DraftRequirement[]): string {
  const ordered = DRAFT_REQUIREMENT_ORDER.filter((item) =>
    missing.includes(item),
  );
  return `Missing: ${ordered.map((item) => REQUIREMENT_LABEL[item]).join(", ")}`;
}

export function deleteDraftDescription(role: string, company: string): string {
  return `The draft for ${role} at ${company} and its CV copy are deleted for good. Your master CVs are untouched.`;
}

/** `Saved just now` under a minute (clock skew included), else `Saved 5 minutes ago`. */
export function lastSavedLabel(
  updatedAt: string,
  now: Date = new Date(),
): string {
  const saved = new Date(updatedAt);
  if (Number.isNaN(saved.getTime())) return DRAFT_COPY.saved;
  if (now.getTime() - saved.getTime() < 60_000) return "Saved just now";
  return `Saved ${formatDistanceStrict(saved, now, { addSuffix: true, roundingMethod: "floor" })}`;
}

/**
 * Today, as the browser's own calendar day — `YYYY-MM-DD` from LOCAL getters
 * (`getFullYear`/`getMonth`/`getDate`), never `toISOString()` (AC3, T069):
 * `toISOString()` reads UTC, which is the wrong day for anyone west of
 * Greenwich after 8pm and east of it before a few hours past midnight.
 */
export function localCalendarDay(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * `getApiError` returns FastAPI's `detail` UNGUARDED, and a 422's `detail` is
 * an array — rendering it directly into `<p>{message}</p>` throws "Objects
 * are not valid as a React child" (KODI-033 QA round 1, B1). Every place on
 * the draft page that shows a server message to the user goes through this
 * instead: a string `detail` is shown verbatim, anything else falls back to a
 * generic message.
 */
export function safeErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Try again.",
): string {
  if (isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)
      ?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export function lastSavedTitle(updatedAt: string): string {
  const saved = new Date(updatedAt);
  if (Number.isNaN(saved.getTime())) return "";
  return saved.toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
