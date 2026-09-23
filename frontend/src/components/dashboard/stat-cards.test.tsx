import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StatCards } from "./stat-cards";

/**
 * AC4 (R-022): offers and denials come from the API's own numbers; the card
 * recomputes nothing from step or event names.
 *
 * AC23 (KODI-013 addendum) — owner: "Active = not closed (Recommended)". Active
 * now comes straight off `data.active` (applications with `finalized_at`
 * `null`), never `total_applications - offers - denials`. `active` is
 * deliberately set to a value the old arithmetic would NOT produce
 * (10 - 3 - 2 = 5, but `active` here is 4) so this test fails if the card ever
 * goes back to recomputing it.
 */
vi.mock("@/hooks/use-statistics", () => ({
  useGeneralStats: () => ({
    isLoading: false,
    data: {
      total_applications: 10,
      offers: 2,
      denials: 3,
      success_rate: 20,
      active: 4,
    },
  }),
}));

function valueOf(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe("StatCards (AC4, AC23)", () => {
  it("shows the API's offers, denials and active — Active is read, not derived", () => {
    render(<StatCards />);
    expect(valueOf("Offers")).toBe("2");
    expect(valueOf("Denials")).toBe("3");
    expect(valueOf("Total")).toBe("10");
    expect(valueOf("Active")).toBe("4");
  });
});
