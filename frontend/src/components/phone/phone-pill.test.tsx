import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhonePill } from "./phone-pill";

describe("PhonePill", () => {
  it("draws the muted pill by default and a toned one when asked", () => {
    render(
      <>
        <PhonePill>Revoked</PhonePill>
        <PhonePill tone="warn" dot="var(--warning)">
          Pending
        </PhonePill>
      </>,
    );

    const muted = screen.getByText("Revoked").closest("[data-slot]")!;
    expect(muted).toHaveClass("ph-pill");
    expect(muted.className).not.toMatch(/ph-(ok|warn|bad|pri)/);
    const warn = screen.getByText("Pending").closest("[data-slot]")!;
    expect(warn).toHaveClass("ph-pill", "ph-warn");
    const dot = warn.querySelector(".ph-dot")!;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveStyle({ background: "var(--warning)" });
  });

  it("truncates its words", () => {
    render(<PhonePill tone="pri">This device</PhonePill>);
    expect(screen.getByText("This device")).toHaveClass("truncate");
  });
});
