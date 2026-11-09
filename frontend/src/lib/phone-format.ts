import type { User } from "@/services/types/users";

type Named = Pick<User, "username" | "first_name" | "last_name">;

const clean = (value: string | null | undefined) => value?.trim() ?? "";

/**
 * The avatar's letters, the desktop profile's rule (`UserProfileAvatar`):
 * first and last name's first letters when both are set, else the
 * username's first two. Uppercased, as the boards draw them.
 */
export function initials(user: Named): string {
  const first = clean(user.first_name);
  const last = clean(user.last_name);
  const letters =
    first && last ? first[0] + last[0] : user.username.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The name a phone screen greets: "first last" (the last name only with a
 * first one), else the username (PRD 0021 edge case: no first name).
 */
export function displayName(user: Named): string {
  const first = clean(user.first_name);
  if (!first) return user.username;
  return `${first} ${clean(user.last_name)}`.trim();
}
