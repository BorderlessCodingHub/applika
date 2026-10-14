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

export const FEATURE_LIST_COPY = {
  title: "Features",
  description:
    "A new feature starts in beta: only users on its beta list and admins have it. Release it to give it to everyone.",
  tableLabel: "Features",
  columns: {
    key: "Key",
    name: "Name",
    stage: "Stage",
    betaUsers: "Beta users",
    released: "Released",
    you: "You",
  },
  loading: "Loading features",
  loadErrorTitle: "Could not load features",
  loadErrorBody: "The list did not load. Check your connection and try again.",
  retry: "Try again",
  emptyTitle: "No features yet",
  emptyBody:
    "Features appear here once the database upgrade that adds them has run.",
} as const;

export const FEATURE_COPY = {
  stage: { beta: "Beta", general: "General" } satisfies Record<
    FeatureStage,
    string
  >,
  noDescription: "No description",
  notReleased: "Not released",
  /** Screen-reader word behind the dash of a general feature with no release date. */
  notRecorded: "Not recorded",
  key: "Key",
  released: "Released",
  loading: "Loading feature",
  loadErrorTitle: "Could not load this feature",
  loadErrorBody: "Check your connection and try again.",
  retry: "Try again",
  notFoundTitle: "Feature not found",
  backToFeatures: "Back to features",
} as const;

export function featureNotFoundBody(key: string | null | undefined): string {
  return key
    ? `No feature has the key "${key}". Pick one from the list.`
    : "No feature key was given. Pick one from the list.";
}

/** The "You" column: whether the admin has it, and why, in one phrase. */
export const FEATURE_ACCESS_SHORT: Record<
  Exclude<FeatureAccessKind, "none">,
  string
> = {
  general: "Yes, released to everyone",
  list: "Yes, on the beta list",
  admin: "Yes, as an admin",
  off: "No, you turned it off",
};

export function featureAccessShort(me: FeatureAccess): string {
  const kind = featureAccessKind(me);
  if (kind === "none") return me.has ? "Yes" : "No";
  return FEATURE_ACCESS_SHORT[kind];
}

/** "Your access": the reason sentence. */
export const FEATURE_ACCESS_REASON: Record<
  Exclude<FeatureAccessKind, "none">,
  string
> = {
  general: "You have this feature because it's released to everyone.",
  list: "You have this feature because you're on the beta list.",
  admin: "You have this feature because you're an admin.",
  off: "You don't have this feature because you turned it off.",
};

export function featureAccessReason(me: FeatureAccess): string {
  const kind = featureAccessKind(me);
  if (kind === "none") {
    return me.has ? "You have this feature." : "You don't have this feature.";
  }
  return FEATURE_ACCESS_REASON[kind];
}

export const FEATURE_OWN_ACCESS_COPY = {
  title: "Your access",
  switchLabel: "Use this feature myself",
  hint: "Turn it off to see the app as users without it do. This changes only what you see.",
  lockedGeneral:
    "Released to everyone. Your choice applies again if it moves back to beta.",
  lockedList:
    "You're on the beta list, so you keep access. Remove yourself from the list to hide it.",
  loading: "Loading your access",
} as const;

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

export const FEATURE_STAGE_COPY = {
  release: {
    action: "Release to everyone",
    confirm: "Release to everyone",
  },
  moveBack: {
    action: "Move back to beta",
    confirm: "Move back to beta",
    loseAccess: "Users who are neither on this list nor admins lose access.",
    keepList:
      "The beta list stays as it is, and admins who turned it off lose it again.",
  },
  cancel: "Cancel",
  failed: "Could not change the stage. Try again.",
} as const;

export function releaseTitle(name: string): string {
  return `Release ${name} to everyone?`;
}

export function releaseBody(name: string): readonly [string, string] {
  return [
    `Every user gets ${name}, including admins who turned it off.`,
    "The beta list is kept, so you can move it back to beta later.",
  ];
}

export function moveBackTitle(name: string): string {
  return `Move ${name} back to beta?`;
}

export const FEATURE_BETA_LIST_COPY = {
  title: "Beta list",
  description: {
    beta: "These users have it while it's in beta. Admins have it without being on the list.",
    general:
      "Everyone has it now. The list is kept and counts again if it moves back to beta.",
  } satisfies Record<FeatureStage, string>,
  addUser: "Add user",
  searchLabel: "Search the beta list",
  searchPlaceholder: "Search by username",
  tableLabel: "Beta list",
  columns: {
    username: "Username",
    added: "Added",
    addedBy: "Added by",
    actions: "Actions",
  },
  loading: "Loading the beta list",
  loadErrorTitle: "Could not load the beta list",
  loadErrorBody: "The list did not load. Check your connection and try again.",
  retry: "Try again",
  emptyTitle: "No one is on the beta list",
  emptyBody: "Users you add get this feature while it's in beta.",
  noMatchBody: "The search looks at usernames only.",
  clearSearch: "Clear search",
  pageEmptyTitle: "This page is empty",
  pagerLabel: "Beta list pages",
  previousPage: "Previous page",
  nextPage: "Next page",
  remove: "Remove",
  cancel: "Cancel",
} as const;

export function betaListCount(total: number): string {
  return total === 1 ? "1 user" : `${total.toLocaleString("en")} users`;
}

export function betaListNoMatchTitle(search: string): string {
  return `No one on the list matches "${search.trim()}"`;
}

export function betaListGoToPage(page: number): string {
  return `Go to page ${page}`;
}

/** Below `sm` the Added and Added by columns fold into one line under the username. */
export function betaUserAddedLine(
  addedAt: string,
  addedBy: string | null | undefined,
): string {
  const date = formatFeatureDate(addedAt);
  return addedBy ? `Added ${date} by ${addedBy}` : `Added ${date}`;
}

export function betaListPageLabel(page: number, totalPages: number): string {
  return `Page ${page} of ${totalPages}`;
}

export function removeUserLabel(username: string): string {
  return `Remove ${username}`;
}

export function removeUserTitle(username: string): string {
  return `Remove ${username} from the beta list?`;
}

export function removeUserBody(
  username: string,
  featureName: string,
  stage: FeatureStage,
): string {
  return stage === "beta"
    ? `${username} loses ${featureName} on their next page load, unless they're an admin. You can add them again later.`
    : `${username} keeps ${featureName} while it's released to everyone, and loses it if it moves back to beta.`;
}

export function removeUserFailed(username: string): string {
  return `Could not remove ${username}. Try again.`;
}

export const FEATURE_ADD_USER_COPY = {
  trigger: "Add user",
  title: "Add users to the beta list",
  searchLabel: "Search users",
  searchPlaceholder: "Username or email",
  idle: "Type a username or email to find a user.",
  loading: "Searching users",
  errorTitle: "Could not search users.",
  retry: "Try again",
  add: "Add",
  listed: "On the list",
  admin: "Admin",
  done: "Done",
} as const;

export function addUserDescription(featureName: string): string {
  return `Search all users by username or email. A user you add gets ${featureName} on their next page load.`;
}

export function addUserNoMatch(search: string): string {
  return `No user matches "${search.trim()}".`;
}

export function addUserMore(shown: number, total: number): string {
  return `Showing ${shown} of ${total.toLocaleString("en")}. Type more to narrow it down.`;
}

export function addUserLabel(username: string): string {
  return `Add ${username}`;
}

export function listedUserLabel(username: string): string {
  return `${username} is on the list`;
}

export function addedUserStatus(username: string): string {
  return `${username} is on the beta list now.`;
}

export function addUserFailed(username: string): string {
  return `Could not add ${username}. Try again.`;
}

const DAY = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Oct 14, 2026", in the viewer's zone like the other admin tables (`catalog-table.tsx`). */
export function formatFeatureDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DAY.format(date);
}

export function featureHref(key: string): string {
  return `/admin/features/view?key=${encodeURIComponent(key)}`;
}
