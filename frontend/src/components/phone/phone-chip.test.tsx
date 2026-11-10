import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PhoneChip, PhoneChipLink } from "./phone-chip";

describe("PhoneChipLink", () => {
  it("marks the section on screen with aria-current and the on look", () => {
    render(
      <nav aria-label="Sections">
        <PhoneChipLink href="/admin" current>
          Dashboard
        </PhoneChipLink>
        <PhoneChipLink href="/admin/users">Users</PhoneChipLink>
      </nav>,
    );

    const current = screen.getByRole("link", { name: "Dashboard" });
    const other = screen.getByRole("link", { name: "Users" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveAttribute("href", "/admin");
    expect(current).toHaveClass("ph-chip", "ph-on");
    expect(other).not.toHaveAttribute("aria-current");
    expect(other).not.toHaveClass("ph-on");
  });
});

describe("PhoneChip", () => {
  it("is a toggle with aria-pressed when pressed is given", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <PhoneChip pressed onClick={onClick}>
          Newest
        </PhoneChip>
        <PhoneChip pressed={false}>Best fit</PhoneChip>
        <PhoneChip>More filters</PhoneChip>
      </>,
    );

    const on = screen.getByRole("button", { name: "Newest" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(on).toHaveClass("ph-on");
    expect(screen.getByRole("button", { name: "Best fit" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "More filters" }),
    ).not.toHaveAttribute("aria-pressed");
    await user.click(on);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
