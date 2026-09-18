import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StatCards } from "./stat-cards";

/**
 * AC4 (R-022): offers and denials come from the API's own numbers; the card
 * recomputes nothing from step or event names.
 */
vi.mock("@/hooks/use-statistics", () => ({
  useGeneralStats: () => ({
    isLoading: false,
    data: {
      total_applications: 10,
      offers: 2,
      denials: 3,
      success_rate: 20,
    },
  }),
}));

function valueOf(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe("StatCards (AC4)", () => {
  it("shows the API's offers and denials and derives Active from them", () => {
    render(<StatCards />);
    expect(valueOf("Offers")).toBe("2");
    expect(valueOf("Denials")).toBe("3");
    expect(valueOf("Total")).toBe("10");
    expect(valueOf("Active")).toBe("5");
  });
});
