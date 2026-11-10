/**
 * The profile's six achievement badges, in display order, and when each is
 * earned. The desktop profile (`profile-view.tsx`) adds its icons and colours
 * on top; the phone profile draws the board's one icon. Words are
 * `profile.badge.<id>` and `profile.badgeDescription.<id>`.
 */
export const PROFILE_BADGE_IDS = [
  "first_app",
  "ten_apps",
  "fifty_apps",
  "hundred_apps",
  "first_offer",
  "high_rate",
] as const;

export type ProfileBadgeId = (typeof PROFILE_BADGE_IDS)[number];

/** The general statistics the badges read (`GET /statistics`). */
export interface ProfileBadgeStats {
  total_applications: number;
  success_rate: number;
  offers: number;
  denials: number;
}

export interface ProfileBadgeState {
  id: ProfileBadgeId;
  earned: boolean;
}

/**
 * Each badge with its earned state; no statistics (still loading) earns
 * none, as the desktop has always drawn it.
 */
export function profileBadgeStates(
  stats: ProfileBadgeStats | undefined,
): ProfileBadgeState[] {
  const total = stats?.total_applications ?? 0;
  const offers = stats?.offers ?? 0;
  const rate = stats?.success_rate ?? 0;
  const earned: Record<ProfileBadgeId, boolean> = {
    first_app: total >= 1,
    ten_apps: total >= 10,
    fifty_apps: total >= 50,
    hundred_apps: total >= 100,
    first_offer: offers >= 1,
    high_rate: rate >= 20 && total >= 5,
  };
  return PROFILE_BADGE_IDS.map((id) => ({ id, earned: earned[id] }));
}
