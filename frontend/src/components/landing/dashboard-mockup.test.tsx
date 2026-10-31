import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { DashboardMockup } from "./dashboard-mockup";

describe("DashboardMockup days and percent", () => {
  it("writes the mockup's days as MM-DD in English", () => {
    render(<DashboardMockup />);
    expect(screen.getAllByText("02-14")).toHaveLength(2);
    expect(screen.getAllByText("03-10")).toHaveLength(2);
    expect(screen.getByText("+25%")).toBeInTheDocument();
  });

  it("writes them as DD/MM in Portuguese", async () => {
    await renderInPortuguese(<DashboardMockup />);
    expect(screen.getAllByText("14/02")).toHaveLength(2);
    expect(screen.getAllByText("10/03")).toHaveLength(2);
    expect(screen.queryByText("02-14")).toBeNull();
    expect(screen.getByText("+25%")).toBeInTheDocument();
  });
});
