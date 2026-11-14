import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PhoneOption, PhoneOptionGroup } from "./phone-option";

/** The boards' `.opt` radio cards: a Radix radiogroup, one tab stop. */

function Group({
  label,
  labelledBy,
  disabled,
  onChange = vi.fn(),
  size,
}: {
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  size?: "default" | "lg";
}) {
  const [value, setValue] = useState("a");
  return (
    <>
      <p id="heading">Heading on screen</p>
      <PhoneOptionGroup
        label={label}
        labelledBy={labelledBy}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        disabled={disabled}
      >
        <PhoneOption value="a" title="First" hint="The first one" size={size} />
        <PhoneOption value="b" title="Second" size={size} />
      </PhoneOptionGroup>
    </>
  );
}

describe("PhoneOptionGroup", () => {
  it("is named by its label when no heading names it", () => {
    render(<Group label="How to start" />);
    const group = screen.getByRole("radiogroup", { name: "How to start" });
    expect(group).not.toHaveAttribute("aria-labelledby");
  });

  it("prefers the heading it is labelled by over a label", () => {
    render(<Group labelledBy="heading" label="Ignored" />);
    const group = screen.getByRole("radiogroup", { name: "Heading on screen" });
    expect(group).not.toHaveAttribute("aria-label");
  });

  it("checks the value, marks it ph-on, and selects on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Group label="Pick" onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "First" });
    const second = screen.getByRole("radio", { name: "Second" });

    expect(first).toBeChecked();
    expect(first).toHaveClass("ph-opt", "ph-on");
    expect(second).not.toHaveClass("ph-on");

    await user.click(second);
    expect(onChange).toHaveBeenCalledWith("b");
    expect(second).toBeChecked();
    expect(second).toHaveClass("ph-on");
    expect(first).not.toHaveClass("ph-on");
  });

  it("reads the title as the name and the hint as the description", () => {
    render(<Group label="Pick" />);
    expect(
      screen.getByRole("radio", { name: "First" }),
    ).toHaveAccessibleDescription("The first one");
    expect(screen.getByRole("radio", { name: "Second" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("locks every radio while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Group label="Pick" disabled onChange={onChange} />);

    for (const radio of within(
      screen.getByRole("radiogroup", { name: "Pick" }),
    ).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    await user.click(screen.getByRole("radio", { name: "Second" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("PhoneOption sizes", () => {
  it("default: v2/StartApplication's 15/13 type", () => {
    render(<Group label="Pick" />);
    const title = screen.getByText("First");
    expect(title).toHaveClass("text-[15px]");
    expect(screen.getByText("The first one")).toHaveClass("text-[13px]");
  });

  it("lg: v2/Welcome's 16/14 type at 1.45 with a 4px gap", () => {
    render(<Group label="Pick" size="lg" />);
    expect(screen.getByText("First")).toHaveClass("text-[16px]");
    const hint = screen.getByText("The first one");
    expect(hint).toHaveClass("text-[14px]", "leading-[1.45]");
    expect(hint.parentElement).toHaveClass("gap-1");
  });
});
