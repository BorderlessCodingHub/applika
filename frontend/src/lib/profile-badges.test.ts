import { describe, expect, it } from "vitest";

import { PROFILE_BADGE_IDS, profileBadgeStates } from "./profile-badges";

const earned = (stats: Parameters<typeof profileBadgeStates>[0]) =>
  profileBadgeStates(stats)
    .filter((badge) => badge.earned)
    .map((badge) => badge.id);

describe("profileBadgeStates", () => {
  it("lists the six badges in order, none earned before the numbers arrive", () => {
    const states = profileBadgeStates(undefined);
    expect(states.map((badge) => badge.id)).toEqual([...PROFILE_BADGE_IDS]);
    expect(states.every((badge) => !badge.earned)).toBe(true);
  });

  it("earns the volume badges at 1, 10, 50 and 100 applications", () => {
    const at = (total: number) =>
      earned({
        total_applications: total,
        success_rate: 0,
        offers: 0,
        denials: 0,
      });
    expect(at(1)).toEqual(["first_app"]);
    expect(at(10)).toEqual(["first_app", "ten_apps"]);
    expect(at(50)).toEqual(["first_app", "ten_apps", "fifty_apps"]);
    expect(at(100)).toEqual([
      "first_app",
      "ten_apps",
      "fifty_apps",
      "hundred_apps",
    ]);
  });

  it("earns First Offer with one offer, and Sharpshooter at 20% from 5 applications", () => {
    expect(
      earned({
        total_applications: 4,
        success_rate: 25,
        offers: 1,
        denials: 0,
      }),
    ).toEqual(["first_app", "first_offer"]);
    expect(
      earned({
        total_applications: 5,
        success_rate: 20,
        offers: 1,
        denials: 0,
      }),
    ).toEqual(["first_app", "first_offer", "high_rate"]);
  });
});
