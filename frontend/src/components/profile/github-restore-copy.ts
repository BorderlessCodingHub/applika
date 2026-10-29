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

export const GITHUB_RESTORE_NOTICE_COPY: Record<GithubRestoreStatus, string> = {
  restored:
    "Your old applika account is restored. It signs in with Borderless from now on.",
  not_found:
    "No old applika account was found for this GitHub account. Nothing was changed.",
  has_data:
    "Not restored: this account already holds data, and two accounts that both hold data are not merged.",
  already_bound:
    "Not restored: that old applika account is already linked to another Borderless account.",
  error: "The restore did not finish. Try again.",
};

export const GITHUB_RESTORE_COPY = {
  privacy:
    "GitHub asks you to approve. applika reads your GitHub user id once and keeps no access to your account.",
  cardTitle: "Old GitHub account",
  cardBody:
    "Used applika with GitHub before? Restore that account's applications, cycles, reports and CVs, while this account still holds no data.",
  cardAction: "Restore data from GitHub",
  dismiss: "Dismiss notice",
} as const;
