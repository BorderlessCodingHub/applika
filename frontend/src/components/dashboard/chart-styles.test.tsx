import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomTooltip } from "./chart-styles";

describe("CustomTooltip", () => {
  it("uses labelFormatter, so a stage chart shows the full stage label", () => {
    render(
      <CustomTooltip
        active
        label="Screening"
        labelFormatter={() => "Interview - Initial screening"}
        payload={[{ name: "conversion_rate", value: 40 }]}
        sufix="%"
      />,
    );
    expect(
      screen.getByText("Interview - Initial screening"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Screening")).not.toBeInTheDocument();
  });

  it("falls back to the raw label without a formatter", () => {
    render(
      <CustomTooltip
        active
        label="Screening"
        payload={[{ name: "x", value: 1 }]}
      />,
    );
    expect(screen.getByText("Screening")).toBeInTheDocument();
  });
});
