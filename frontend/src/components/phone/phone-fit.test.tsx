import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhoneFitPill, PhoneFitRing } from "@/components/phone/phone-fit";

describe("PhoneFitPill", () => {
  it.each([
    [82, "strong", "ph-strong"],
    [70, "strong", "ph-strong"],
    [69, "partial", "ph-partial"],
    [40, "partial", "ph-partial"],
    [39, "low", "ph-low"],
  ])(
    "reads Fit %i% in words, banded %s (>= 70, >= 40, below)",
    (score, band, className) => {
      const { container } = render(<PhoneFitPill id="fit" score={score} />);
      const pill = container.querySelector('[data-slot="fit-badge"]')!;

      expect(pill).toHaveTextContent(`Fit ${score}%`);
      expect(pill).toHaveAttribute("id", "fit");
      expect(pill).toHaveAttribute("data-band", band);
      expect(pill).toHaveAttribute("data-score", String(score));
      expect(pill).toHaveClass("ph-fit", className);
      // The 14px ring is decoration: the words carry the score.
      expect(pill.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(pill.querySelector("svg")).toHaveAttribute("width", "14");
    },
  );

  it("rounds and clamps the score, and draws no arc at 0", () => {
    const { container, rerender } = render(<PhoneFitPill score={140.4} />);
    expect(container).toHaveTextContent("Fit 100%");
    rerender(<PhoneFitPill score={-3} />);
    expect(container).toHaveTextContent("Fit 0%");
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });
});

describe("PhoneFitRing", () => {
  it("is a 56px image named by the score, banded like the pill", () => {
    render(<PhoneFitRing score={82} />);
    const ring = screen.getByRole("img", { name: "Fit 82%" });

    expect(ring).toHaveAttribute("width", "56");
    expect(ring).toHaveAttribute("data-band", "strong");
    expect(ring).toHaveClass("ph-jd-ring");
    const circles = ring.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveAttribute("stroke", "var(--muted)");
    expect(circles[0]).toHaveAttribute("stroke-width", "7");
    expect(circles[1]).toHaveAttribute("stroke", "var(--success)");
  });

  it("uses the warning arc for a partial fit and the muted one below 40", () => {
    const { rerender } = render(<PhoneFitRing score={55} />);
    expect(
      screen
        .getByRole("img", { name: "Fit 55%" })
        .querySelectorAll("circle")[1],
    ).toHaveAttribute("stroke", "var(--warning)");
    rerender(<PhoneFitRing score={12} />);
    expect(
      screen
        .getByRole("img", { name: "Fit 12%" })
        .querySelectorAll("circle")[1],
    ).toHaveAttribute("stroke", "var(--muted-foreground)");
  });
});
