import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PhoneCheckOption } from "./phone-check-option";

function Controlled({
  onChange = () => {},
  onClick,
  invalid,
}: {
  onChange?: (checked: boolean) => void;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  invalid?: boolean;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <p id="extra">Choose one or both.</p>
      <PhoneCheckOption
        checked={checked}
        onCheckedChange={(next) => {
          setChecked(next);
          onChange(next);
        }}
        onClick={onClick}
        invalid={invalid}
        label="BASE"
        description="Reports from Borderless BASE members."
        aria-describedby="extra"
        data-badge="borderless_base"
      />
    </>
  );
}

describe("PhoneCheckOption", () => {
  it("is a checkbox named by its label and described by its line, then any description given", () => {
    render(<Controlled />);

    const option = screen.getByRole("checkbox", { name: "BASE" });
    expect(option.tagName).toBe("BUTTON");
    expect(option).toHaveAttribute("type", "button");
    expect(option).toHaveAttribute("aria-checked", "false");
    expect(option).toHaveAttribute("data-slot", "phone-check-option");
    expect(option).toHaveAttribute("data-badge", "borderless_base");
    expect(option).toHaveClass("ph-opt", "ph-opt-chk");
    expect(option).toHaveAccessibleDescription(
      "Reports from Borderless BASE members. Choose one or both.",
    );
    expect(option.querySelector(".ph-box")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("BASE")).toHaveClass("ph-opt-l");
    expect(
      screen.getByText("Reports from Borderless BASE members."),
    ).toHaveClass("ph-opt-d");
    expect(option).not.toHaveAttribute("aria-invalid");
  });

  it("toggles on tap, Enter and Space, drawing the check in the box", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const option = screen.getByRole("checkbox", { name: "BASE" });

    await user.click(option);
    expect(option).toHaveAttribute("aria-checked", "true");
    expect(option.querySelector(".ph-box svg")).not.toBeNull();

    option.focus();
    await user.keyboard("{Enter}");
    expect(option).toHaveAttribute("aria-checked", "false");
    expect(option.querySelector(".ph-box svg")).toBeNull();

    await user.keyboard(" ");
    expect(option).toHaveAttribute("aria-checked", "true");
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it("runs a given onClick first, and a prevented click does not toggle", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Controlled
        onChange={onChange}
        onClick={(event) => event.preventDefault()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "BASE" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "BASE" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("marks a refused choice invalid", () => {
    render(<Controlled invalid />);
    expect(screen.getByRole("checkbox", { name: "BASE" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
