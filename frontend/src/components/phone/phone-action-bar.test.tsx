import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhoneActionBar } from "./phone-action-bar";

describe("PhoneActionBar", () => {
  it("is the board's fixed .bar, with the caller's classes and children", () => {
    render(
      <PhoneActionBar className="flex-wrap" aria-label="Actions">
        <button type="button">Approve</button>
      </PhoneActionBar>,
    );
    const bar = document.querySelector('[data-slot="phone-action-bar"]');

    expect(bar).toHaveClass("ph-app", "ph-bar", "flex-wrap");
    expect(bar).toHaveAttribute("aria-label", "Actions");
    expect(bar).toContainElement(
      screen.getByRole("button", { name: "Approve" }),
    );
  });
});
