import { formatDistanceStrict } from "date-fns";
import { isAxiosError } from "axios";

import { dateFnsLocale } from "@/i18n/date-locale";
import { intlLocale } from "@/i18n/intl-locale";
import { getTranslatorLocale, word } from "@/i18n/translator";
import { apiErrorMessage } from "@/lib/api-error-message";

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

export const NEW_WITH_CV_HREF = "/applications/new-with-cv";

export function draftResumeHref(draftId: string): string {
  return `${NEW_WITH_CV_HREF}?id=${encodeURIComponent(draftId)}`;
}

/**
 * The draft flow's on-screen words live in `drafts.*` (both message files).
 * Components read them with `useTranslations("drafts…")`, which subscribes to
 * the language; the helpers below read the active language at call time
 * (`word`), so a component calling them must subscribe too.
 */

export const DRAFT_STEP_NUMBER: Record<DraftStep, number> = {
  application: 1,
  cv: 2,
};

/** `Step 1: Application`, the stepper button's accessible name. */
export function stepLabel(step: DraftStep): string {
  return word("drafts.steps.label", {
    number: DRAFT_STEP_NUMBER[step],
    title: word(`drafts.steps.${step}.title`),
  });
}

/** `Missing: company, role, platform, CV copy`, always in on-screen order. */
export function missingLabel(missing: readonly DraftRequirement[]): string {
  const ordered = DRAFT_REQUIREMENT_ORDER.filter((item) =>
    missing.includes(item),
  );
  return word("drafts.requirement.missing", {
    list: ordered.map((item) => word(`drafts.requirement.${item}`)).join(", "),
  });
}

export function deleteDraftDescription(role: string, company: string): string {
  return word("drafts.section.deleteDescription", { role, company });
}

/** `Saved just now` under a minute (clock skew included), else `Saved 5 minutes ago`. */
export function lastSavedLabel(
  updatedAt: string,
  now: Date = new Date(),
): string {
  const saved = new Date(updatedAt);
  if (Number.isNaN(saved.getTime())) return word("drafts.page.saved");
  if (now.getTime() - saved.getTime() < 60_000) {
    return word("drafts.section.savedJustNow");
  }
  return word("drafts.section.savedAgo", {
    distance: formatDistanceStrict(saved, now, {
      addSuffix: true,
      roundingMethod: "floor",
      locale: dateFnsLocale(getTranslatorLocale()),
    }),
  });
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
 * `value` (a `YYYY-MM-DD` application date) is today or earlier, compared as
 * CALENDAR STRINGS against `localCalendarDay()` — never as `Date` objects
 * (frontend-qa KODI-036 round 1, B1). `new Date(v) <= new Date()` reads "now"
 * at whatever precision `Date` gives it, which is really UTC-relative once
 * both sides are compared as instants; a user whose local calendar day is
 * already ahead of UTC's (most of Asia/Oceania, and Europe past midnight) had
 * their own TODAY refused as "in the future". Two `YYYY-MM-DD` strings
 * compare correctly with `<=` lexicographically — there is no timezone left
 * to get wrong once both sides are already calendar days, not instants.
 */
export function isNotFutureCalendarDay(
  value: string,
  today: string = localCalendarDay(),
): boolean {
  return value <= today;
}

/**
 * Every place on the draft page that shows a server message to the user goes
 * through this: the error's code in the active language, else a string
 * `detail` verbatim, else `fallback` (`lib/api-error-message.ts`). A 422's
 * `detail` array never reaches `<p>{message}</p>`.
 */
export function safeErrorMessage(
  error: unknown,
  fallback: string = word("drafts.unknownError"),
): string {
  if (!isAxiosError(error)) return fallback;
  return apiErrorMessage(error.response?.data, fallback);
}

export function lastSavedTitle(updatedAt: string): string {
  const saved = new Date(updatedAt);
  if (Number.isNaN(saved.getTime())) return "";
  return saved.toLocaleString(intlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
