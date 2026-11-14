import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhoneField, PhoneInput, PhoneTextarea } from "./phone-field";

describe("PhoneField", () => {
  it("labels its control and describes it by its hint", () => {
    render(
      <PhoneField label="Cycle name" hint="Shown on the archive">
        <PhoneInput placeholder="e.g. Fall 2026" />
      </PhoneField>,
    );

    const input = screen.getByRole("textbox", { name: "Cycle name" });
    expect(input).toHaveClass("ph-input");
    expect(input).toHaveAccessibleDescription("Shown on the archive");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and describes it by the error too", () => {
    render(
      <PhoneField label="Goal" hint="Two weeks out" error="Too long">
        <PhoneTextarea />
      </PhoneField>,
    );

    const area = screen.getByRole("textbox", { name: "Goal" });
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveAttribute("aria-invalid", "true");
    expect(area).toHaveAccessibleDescription("Two weeks out Too long");
    expect(
      document.querySelector('[data-slot="phone-field-error"]'),
    ).toHaveTextContent("Too long");
  });

  it("keeps the id it is given", () => {
    render(
      <PhoneField label="Name" id="cycle-name">
        <PhoneInput />
      </PhoneField>,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "id",
      "cycle-name",
    );
  });
});
