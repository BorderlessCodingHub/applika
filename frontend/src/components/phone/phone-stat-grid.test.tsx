import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhoneStat, PhoneStatGrid } from "./phone-stat-grid";

describe("PhoneStatGrid", () => {
  it("pairs each term with its value in one description list", () => {
    render(
      <PhoneStatGrid data-slot="admin-stats">
        <PhoneStat term="Total users" mono valueClassName="ph-dd-num">
          1,284
        </PhoneStat>
        <PhoneStat term="LinkedIn" wide>
          linkedin.com/in/sam
        </PhoneStat>
      </PhoneStatGrid>,
    );

    const list = document.querySelector('dl[data-slot="admin-stats"]')!;
    expect(list).toHaveClass("ph-dl");
    const terms = screen.getAllByRole("term");
    const values = screen.getAllByRole("definition");
    expect(terms.map((term) => term.textContent)).toEqual([
      "Total users",
      "LinkedIn",
    ]);
    expect(values[0]).toHaveTextContent("1,284");
    expect(values[0]).toHaveClass("ph-mono", "ph-dd-num");
    expect(values[1]).not.toHaveClass("ph-mono");
    // LinkedIn spans both columns, as the Profile board draws it.
    expect(values[1].parentElement).toHaveClass("col-span-2");
    expect(values[0].parentElement).not.toHaveClass("col-span-2");
  });
});
