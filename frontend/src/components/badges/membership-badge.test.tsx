import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MembershipBadge, membershipAccess } from "./membership-badge";

/**
 * The membership chip (ADR-0024): "BASE" or "PSP" in words, named
 * "Borderless BASE member" / "Borderless PSP member", never colour alone;
 * and the one rule that decides whether a recorded badge counts.
 */

const ACTIVE = {
  status: "active",
  expires_at: "2026-11-05T00:00:00Z",
  email: "a@b.c",
};

describe("MembershipBadge", () => {
  it.each([
    ["borderless_base", "BASE", "Borderless BASE member"],
    ["borderless_psp", "PSP", "Borderless PSP member"],
  ] as const)("%s reads %s and is named %s", (badge, text, name) => {
    render(<MembershipBadge badge={badge} />);

    const chip = screen.getByRole("img", { name });
    expect(chip).toHaveTextContent(text);
    expect(chip).toHaveAttribute("data-badge", badge);
  });

  it("as a label (a webhook's badge) it is plain text, not an image", () => {
    render(<MembershipBadge badge="borderless_base" purpose="label" />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("BASE")).toBeInTheDocument();
  });
});

describe("membershipAccess", () => {
  it("is none with no recorded badge, whatever the access", () => {
    expect(membershipAccess({ badges: [], borderless: ACTIVE })).toEqual({
      state: "none",
      badges: [],
    });
    expect(membershipAccess(null).state).toBe("none");
  });

  it("is held while the Borderless access is active", () => {
    expect(
      membershipAccess({
        badges: [{ badge: "borderless_psp" }],
        borderless: ACTIVE,
      }),
    ).toEqual({ state: "held", badges: ["borderless_psp"] });
  });

  it.each(["expired", "needs_reconnect"])(
    "is unconfirmed while the access is %s",
    (status) => {
      expect(
        membershipAccess({
          badges: [{ badge: "borderless_base" }],
          borderless: { ...ACTIVE, status },
        }).state,
      ).toBe("unconfirmed");
    },
  );

  it("lists BASE before PSP, deduped, ignoring unknown keys", () => {
    expect(
      membershipAccess({
        badges: [
          { badge: "borderless_psp" },
          { badge: "borderless_base" },
          { badge: "borderless_psp" },
          { badge: "free" },
        ],
        borderless: ACTIVE,
      }).badges,
    ).toEqual(["borderless_base", "borderless_psp"]);
  });
});
