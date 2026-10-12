import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FitBadge } from "./fit-badge";

describe("FitBadge (T083)", () => {
  it("says the score in words, never colour alone", () => {
    render(<FitBadge score={72} />);
    const badge = screen.getByText("Fit 72%");
    expect(badge).toHaveAttribute("data-band", "strong");
    expect(badge).toHaveAttribute("data-score", "72");
  });

  it.each([
    [0, "Fit 0%", "low"],
    [100, "Fit 100%", "strong"],
    [45, "Fit 45%", "partial"],
    [39.6, "Fit 40%", "partial"],
    [140, "Fit 100%", "strong"],
  ])("renders %s as %s (%s band)", (score, words, band) => {
    render(<FitBadge score={score} />);
    expect(screen.getByText(words)).toHaveAttribute("data-band", band);
  });

  it("reads 'No fit yet' without a score", () => {
    render(<FitBadge score={null} />);
    expect(screen.getByText("No fit yet")).toHaveAttribute("data-band", "none");
  });
});
