import { useLocale } from "next-intl";

import { intlLocale } from "@/i18n/intl-locale";
import { liveCopy, word } from "@/i18n/translator";
import type { FeatureStage } from "@/services/types/features";

export type FeatureVia = "general" | "list" | "admin";

/** `me` on a `GET /admin/features` row: the calling admin's own access. */
export interface FeatureAccess {
  has: boolean;
  via: FeatureVia | null;
  opted_out: boolean;
}

/** `GET /admin/features` row; structurally the service's `AdminFeature`. It has no `id`: `key` is the identity. */
export interface FeatureRow {
  key: string;
  name: string;
  description: string | null;
  stage: FeatureStage;
  beta_user_count: number;
  released_at: string | null;
  me: FeatureAccess;
}

/** `GET /admin/features/{key}/users` item; structurally the service's `AdminFeatureUser`. */
export interface FeatureBetaUser {
  user_id: string;
  username: string;
  email: string;
  added_at: string;
  added_by: { id: string; username: string } | null;
}

export interface FeatureBetaUsersResult {
  items: readonly FeatureBetaUser[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** A `GET /admin/users?search=` row; `AdminUserRow` fits. */
export interface FeatureUserCandidate {
  id: string;
  username: string;
  email: string;
  is_admin?: boolean;
}

/** Why the calling admin has the feature, or why not. `none` never comes from the API today. */
export type FeatureAccessKind = FeatureVia | "off" | "none";

export function featureAccessKind(me: FeatureAccess): FeatureAccessKind {
  if (me.via) return me.via;
  return me.opted_out ? "off" : "none";
}

const NS = "admin.features";

/**
 * Subscribes a component to the language: call it in every component that
 * renders the copy below, so a switch re-renders the words read through the
 * module translator.
 */
export function useFeatureCopyLocale(): string {
  return useLocale();
}

/**
 * The features screens' words, in the active language (`admin.features.*`).
 * Every field is a getter, so a read returns the current language; the
 * components rendering them subscribe (`useLocale`/`useTranslations`), so a
 * language switch re-renders them. Never spread these objects, never
 * destructure them at module scope: that would freeze the words.
 */
export const FEATURE_LIST_COPY = Object.assign(
  liveCopy(`${NS}.list`, [
    "title",
    "description",
    "tableLabel",
    "loading",
    "loadErrorTitle",
    "loadErrorBody",
    "retry",
    "emptyTitle",
    "emptyBody",
  ]),
  {
    columns: liveCopy(`${NS}.list.columns`, [
      "key",
      "name",
      "stage",
      "betaUsers",
      "released",
      "you",
    ]),
  },
);

export const FEATURE_COPY = Object.assign(
  liveCopy(`${NS}.feature`, [
    "noDescription",
    "notReleased",
    /** Screen-reader word behind the dash of a general feature with no release date. */
    "notRecorded",
    "key",
    "released",
    "loading",
    "loadErrorTitle",
    "loadErrorBody",
    "retry",
    "notFoundTitle",
    "backToFeatures",
  ]),
  {
    stage: liveCopy(`${NS}.feature.stage`, [
      "beta",
      "general",
    ]) satisfies Record<FeatureStage, string>,
  },
);

export function featureNotFoundBody(key: string | null | undefined): string {
  return key
    ? word(`${NS}.feature.notFoundBody`, { key })
    : word(`${NS}.feature.notFoundNoKey`);
}

/** The "You" column: whether the admin has it, and why, in one phrase. */
export const FEATURE_ACCESS_SHORT: Readonly<
  Record<Exclude<FeatureAccessKind, "none">, string>
> = liveCopy(`${NS}.accessShort`, ["general", "list", "admin", "off"]);

export function featureAccessShort(me: FeatureAccess): string {
  const kind = featureAccessKind(me);
  if (kind === "none") {
    return word(me.has ? `${NS}.accessShort.yes` : `${NS}.accessShort.no`);
  }
  return FEATURE_ACCESS_SHORT[kind];
}

/** "Your access": the reason sentence. */
export const FEATURE_ACCESS_REASON: Readonly<
  Record<Exclude<FeatureAccessKind, "none">, string>
> = liveCopy(`${NS}.accessReason`, ["general", "list", "admin", "off"]);

export function featureAccessReason(me: FeatureAccess): string {
  const kind = featureAccessKind(me);
  if (kind === "none") {
    return word(
      me.has ? `${NS}.accessReason.has` : `${NS}.accessReason.hasNot`,
    );
  }
  return FEATURE_ACCESS_REASON[kind];
}

export const FEATURE_OWN_ACCESS_COPY = liveCopy(`${NS}.ownAccess`, [
  "title",
  "switchLabel",
  "hint",
  "lockedGeneral",
  "lockedList",
  "loading",
]);

/** Why the switch cannot change now, or `null` when it can. */
export type FeatureOwnAccessLock = "general" | "list";

export function featureOwnAccessLock(
  stage: FeatureStage,
  me: FeatureAccess,
): FeatureOwnAccessLock | null {
  if (stage === "general" || me.via === "general") return "general";
  if (me.via === "list") return "list";
  return null;
}

export const FEATURE_STAGE_COPY = Object.assign(
  liveCopy(`${NS}.stageAction`, ["cancel", "failed"]),
  {
    release: liveCopy(`${NS}.stageAction.release`, ["action", "confirm"]),
    moveBack: liveCopy(`${NS}.stageAction.moveBack`, [
      "action",
      "confirm",
      "loseAccess",
      "keepList",
    ]),
  },
);

export function releaseTitle(name: string): string {
  return word(`${NS}.stageAction.releaseTitle`, { name });
}

export function releaseBody(name: string): readonly [string, string] {
  return [
    word(`${NS}.stageAction.releaseEveryone`, { name }),
    word(`${NS}.stageAction.releaseKeepList`),
  ];
}

export function moveBackTitle(name: string): string {
  return word(`${NS}.stageAction.moveBackTitle`, { name });
}

export const FEATURE_BETA_LIST_COPY = Object.assign(
  liveCopy(`${NS}.betaList`, [
    "title",
    "addUser",
    "searchLabel",
    "searchPlaceholder",
    "tableLabel",
    "loading",
    "loadErrorTitle",
    "loadErrorBody",
    "retry",
    "emptyTitle",
    "emptyBody",
    "noMatchBody",
    "clearSearch",
    "pageEmptyTitle",
    "pagerLabel",
    "previousPage",
    "nextPage",
    "remove",
    "cancel",
  ]),
  {
    description: liveCopy(`${NS}.betaList.description`, [
      "beta",
      "general",
    ]) satisfies Record<FeatureStage, string>,
    columns: liveCopy(`${NS}.betaList.columns`, [
      "username",
      "added",
      "addedBy",
      "actions",
    ]),
  },
);

/** "1 user", "1,234 users" ("1.234 usuários" in Portuguese). */
export function betaListCount(total: number): string {
  return word(`${NS}.betaList.count`, { count: total });
}

export function betaListNoMatchTitle(search: string): string {
  return word(`${NS}.betaList.noMatchTitle`, { search: search.trim() });
}

export function betaListGoToPage(page: number): string {
  return word(`${NS}.betaList.goToPage`, { page: String(page) });
}

/** Below `sm` the Added and Added by columns fold into one line under the username. */
export function betaUserAddedLine(
  addedAt: string,
  addedBy: string | null | undefined,
): string {
  const date = formatFeatureDate(addedAt);
  return addedBy
    ? word(`${NS}.betaList.addedLineBy`, { date, user: addedBy })
    : word(`${NS}.betaList.addedLine`, { date });
}

export function betaListPageLabel(page: number, totalPages: number): string {
  return word(`${NS}.betaList.pageLabel`, {
    page: String(page),
    totalPages: String(totalPages),
  });
}

export function removeUserLabel(username: string): string {
  return word(`${NS}.betaList.removeLabel`, { username });
}

export function removeUserTitle(username: string): string {
  return word(`${NS}.betaList.removeTitle`, { username });
}

export function removeUserBody(
  username: string,
  featureName: string,
  stage: FeatureStage,
): string {
  return word(
    stage === "beta"
      ? `${NS}.betaList.removeBodyBeta`
      : `${NS}.betaList.removeBodyGeneral`,
    { username, featureName },
  );
}

export function removeUserFailed(username: string): string {
  return word(`${NS}.betaList.removeFailed`, { username });
}

export const FEATURE_ADD_USER_COPY = liveCopy(`${NS}.addUser`, [
  "trigger",
  "title",
  "searchLabel",
  "searchPlaceholder",
  "idle",
  "loading",
  "errorTitle",
  "retry",
  "add",
  "listed",
  "admin",
  "done",
]);

export function addUserDescription(featureName: string): string {
  return word(`${NS}.addUser.description`, { featureName });
}

export function addUserNoMatch(search: string): string {
  return word(`${NS}.addUser.noMatch`, { search: search.trim() });
}

/** "Showing 10 of 1,234" ("1.234" in Portuguese). */
export function addUserMore(shown: number, total: number): string {
  return word(`${NS}.addUser.more`, {
    shown: String(shown),
    total: formatFeatureCount(total),
  });
}

export function addUserLabel(username: string): string {
  return word(`${NS}.addUser.addLabel`, { username });
}

export function listedUserLabel(username: string): string {
  return word(`${NS}.addUser.listedLabel`, { username });
}

export function addedUserStatus(username: string): string {
  return word(`${NS}.addUser.addedStatus`, { username });
}

export function addUserFailed(username: string): string {
  return word(`${NS}.addUser.failed`, { username });
}

/** A count with the language's grouping: "1,234" in English, "1.234" in Portuguese. */
export function formatFeatureCount(value: number): string {
  return value.toLocaleString(intlLocale());
}

const DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();

function dayFormat(tag: string): Intl.DateTimeFormat {
  let format = DAY_FORMATS.get(tag);
  if (!format) {
    format = new Intl.DateTimeFormat(tag, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    DAY_FORMATS.set(tag, format);
  }
  return format;
}

/**
 * "Oct 14, 2026" ("14 de out. de 2026" in Portuguese), in the viewer's zone
 * like the other admin tables (`catalog-table.tsx`). Reads the active
 * language at call time; a component rendering it subscribes.
 */
export function formatFeatureDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : dayFormat(intlLocale()).format(date);
}

export function featureHref(key: string): string {
  return `/admin/features/view?key=${encodeURIComponent(key)}`;
}
