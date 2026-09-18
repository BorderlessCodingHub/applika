import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MonthYearInput } from "./month-year-input";
import { MONTH_YEAR_DISPLAY_FORMAT } from "@/lib/month-year";

/**
 * The CV month-and-year control (KODI-007 / AC3).
 *
 * The owner: "it's a date input but only for month and year "MM/yyyy" for both
 * start and finish". It is a MASKED TEXT input, not a calendar and not a pair
 * of selects: `MM/yyyy` on screen, ISO `YYYY-MM` out of `onChange`, and one
 * `<input>` so a single `fill()` drives it from Playwright.
 */

/** A controlled host, exactly how the CV form holds one. */
function Host({
  initial = "",
  onChange,
  disabled,
}: {
  initial?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <label>
      Start
      <MonthYearInput
        value={value}
        disabled={disabled}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </label>
  );
}

describe("MonthYearInput", () => {
  it("shows a stored ISO month as MM/yyyy, never as ISO", () => {
    render(<Host initial="2023-02" />);

    expect(screen.getByLabelText("Start")).toHaveValue("02/2023");
  });

  it("emits ISO YYYY-MM once the six digits are in", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const input = screen.getByLabelText("Start");

    await user.type(input, "022023");

    expect(input).toHaveValue("02/2023");
    expect(onChange).toHaveBeenLastCalledWith("2023-02");
  });

  it("inserts the separator for the user, who only types digits", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText("Start");

    await user.type(input, "0");
    expect(input).toHaveValue("0");
    await user.type(input, "2");
    expect(input).toHaveValue("02");
    await user.type(input, "2023");
    expect(input).toHaveValue("02/2023");
  });

  it("takes a whole MM/yyyy in one go, the way fill() and paste deliver it", async () => {
    // `e2e/cv-builder.spec.ts` drives this with `.fill("02/2023")`, which is a
    // single `input` event carrying the whole string.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const input = screen.getByLabelText("Start");

    await user.click(input);
    await user.paste("02/2023");

    expect(input).toHaveValue("02/2023");
    expect(onChange).toHaveBeenLastCalledWith("2023-02");
  });

  it("zero-pads an unpadded month so December is still reachable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);

    await user.click(screen.getByLabelText("Start"));
    await user.paste("2/2023");

    expect(screen.getByLabelText("Start")).toHaveValue("02/2023");
    expect(onChange).toHaveBeenLastCalledWith("2023-02");
  });

  it("holds a half-typed value on screen while it emits nothing", async () => {
    // The draft is what the user sees. A single-condition prop sync would wipe
    // "02/20" the moment the field emitted `""`, and the field would fight the
    // typing.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const input = screen.getByLabelText("Start");

    await user.type(input, "0220");

    expect(input).toHaveValue("02/20");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("holds an impossible month verbatim and emits nothing for it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const input = screen.getByLabelText("Start");

    await user.type(input, "132024");

    expect(input).toHaveValue("13/2024");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("drops non-digits instead of showing them", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText("Start");

    await user.type(input, "abc");

    expect(input).toHaveValue("");
  });

  it("clears back to empty, which is how a finish is emptied", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host initial="2023-02" onChange={onChange} />);
    const input = screen.getByLabelText("Start");

    await user.clear(input);

    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("re-syncs when the parent hands it a different date", () => {
    const { rerender } = render(
      <MonthYearInput value="2023-02" onChange={() => {}} aria-label="Start" />,
    );
    expect(screen.getByLabelText("Start")).toHaveValue("02/2023");

    rerender(
      <MonthYearInput value="2024-11" onChange={() => {}} aria-label="Start" />,
    );
    expect(screen.getByLabelText("Start")).toHaveValue("11/2024");
  });

  it("survives a stored value it cannot spell, instead of looping on it", () => {
    // `2024-13` is not a month. The draft sync is guarded on BOTH conditions
    // precisely so an unparseable stored value renders once as empty rather
    // than re-setting state on every render.
    render(
      <MonthYearInput value="2024-13" onChange={() => {}} aria-label="Start" />,
    );

    expect(screen.getByLabelText("Start")).toHaveValue("");
  });

  it("reads null and undefined as empty, which is what a current entry is", () => {
    render(
      <MonthYearInput value={null} onChange={() => {}} aria-label="Finish" />,
    );

    expect(screen.getByLabelText("Finish")).toHaveValue("");
  });

  it("announces the format it wants through the placeholder", () => {
    render(<Host />);

    expect(screen.getByLabelText("Start")).toHaveAttribute(
      "placeholder",
      MONTH_YEAR_DISPLAY_FORMAT,
    );
  });

  it("is a numeric text input with no autocomplete and a seven-character cap", () => {
    render(<Host />);
    const input = screen.getByLabelText("Start");

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("maxlength", "7");
  });

  it("takes aria-invalid and aria-required through, for the required Start", () => {
    render(
      <MonthYearInput
        value=""
        onChange={() => {}}
        aria-label="Start"
        aria-required
        aria-invalid
      />,
    );
    const input = screen.getByLabelText("Start");

    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("renders one labelable node, so a wrapping CvField label names it", () => {
    render(<Host />);

    // `CvField` WRAPS its child in a `<label>`; a second labelable control in
    // here would steal the name. The calendar glyph is `aria-hidden`.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("disables cleanly and still reads its value, for the read-only copy", () => {
    render(<Host initial="2023-02" disabled />);
    const input = screen.getByLabelText("Start");

    expect(input).toBeDisabled();
    expect(input).toHaveValue("02/2023");
  });
});
