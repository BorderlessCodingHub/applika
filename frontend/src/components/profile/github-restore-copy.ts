import { liveCopy } from "@/i18n/translator";

/** The `status` of `/profile?account=github&status=…`, the restore callback's outcome. */
export const GITHUB_RESTORE_STATUSES = [
  "restored",
  "not_found",
  "has_data",
  "already_bound",
  "error",
] as const;

export type GithubRestoreStatus = (typeof GITHUB_RESTORE_STATUSES)[number];

export function isGithubRestoreStatus(
  value: unknown,
): value is GithubRestoreStatus {
  return (
    typeof value === "string" &&
    (GITHUB_RESTORE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The restore outcome in the active language (`profile.githubRestore.notice`).
 * Getters: a component rendering them subscribes (`useLocale`). Never spread.
 */
export const GITHUB_RESTORE_NOTICE_COPY: Readonly<
  Record<GithubRestoreStatus, string>
> = liveCopy("profile.githubRestore.notice", GITHUB_RESTORE_STATUSES);

export const GITHUB_RESTORE_COPY = liveCopy("profile.githubRestore", [
  "privacy",
  "cardTitle",
  "cardBody",
  "cardAction",
  "dismiss",
]);
