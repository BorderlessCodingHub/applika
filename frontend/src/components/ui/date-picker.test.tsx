/**
 * `DatePickerInput` local-date parsing (KODI-001 / R-001).
 *
 * The reason this component exists instead of `<input type="date">` is the
 * classic off-by-one: `new Date("2026-03-15")` is parsed by the JS engine as
 * *UTC* midnight, so anywhere west of Greenwich it renders as the 14th. The
 * component parses with `date-fns` `parse()`, which builds a *local* date, so
 * the day the user typed is the day the user sees.
 *
 * These tests pin that behaviour in a fixed negative-UTC-offset timezone
 * (`America/Sao_Paulo`, UTC-3) so they are meaningful on a UTC CI runner: in
 * UTC the bug is invisible and any assertion would pass vacuously. Node
 * re-reads `process.env.TZ` at runtime, so the whole suite is deterministic
 * regardless of the host timezone.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DatePickerInput } from "@/components/ui/date-picker";

const ORIGINAL_TZ = process.env.TZ;
/** UTC-3, year-round: a date string parsed as UTC lands on the previous day. */
const NEGATIVE_OFFSET_TZ = "America/Sao_Paulo";

beforeAll(() => {
  process.env.TZ = NEGATIVE_OFFSET_TZ;
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("DatePickerInput local-date parsing", () => {
  it("runs in a timezone where the off-by-one bug is observable", () => {
    // Guards the guard: if this fails the other assertions prove nothing,
    // because in UTC the naive and the correct parse agree.
    expect(new Date(2026, 2, 15).getTimezoneOffset()).toBe(180);
    expect(new Date("2026-03-15").getDate()).toBe(14);
  });

  it("renders the given day, not the day before it", () => {
    render(<DatePickerInput value="2026-03-15" onChange={() => {}} />);

    expect(
      screen.getByRole("button", { name: "2026-03-15" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2026-03-14" })).toBeNull();
  });

  it("keeps the day stable under a display pattern that reorders the parts", () => {
    // `pattern` drives both the parse and the format, so a day-first pattern
    // surfaces an off-by-one as a wrong day number rather than a wrong string.
    render(
      <DatePickerInput
        value="15/03/2026"
        pattern="dd/MM/yyyy"
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "15/03/2026" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["2026-01-01", "new year's day"],
    ["2026-03-15", "mid-month"],
    ["2026-12-31", "new year's eve"],
    ["2024-02-29", "a leap day"],
  ])("round-trips %s (%s) without shifting", (value) => {
    render(<DatePickerInput value={value} onChange={() => {}} />);

    expect(screen.getByRole("button", { name: value })).toBeInTheDocument();
  });

  it("shows the placeholder instead of a bogus date when there is no value", () => {
    render(<DatePickerInput onChange={() => {}} placeholder="Pick a date" />);

    expect(
      screen.getByRole("button", { name: "Pick a date" }),
    ).toBeInTheDocument();
  });

  it("marks the calendar day matching the value as selected", async () => {
    const user = userEvent.setup();
    render(<DatePickerInput value="2026-03-15" onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "2026-03-15" }));

    // The calendar opens on the parsed month and flags the parsed day. An
    // off-by-one would select "Saturday, March 14th, 2026" instead.
    expect(
      await screen.findByRole("button", {
        name: "Sunday, March 15th, 2026, selected",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Saturday, March 14th, 2026, selected",
      }),
    ).toBeNull();
  });

  it("emits the clicked day as a local-formatted string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DatePickerInput value="2026-03-15" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "2026-03-15" }));
    await user.click(
      await screen.findByRole("button", { name: "Monday, March 16th, 2026" }),
    );

    // `format(date, pattern)` is local too: the emitted string must be the day
    // the user clicked, not that day shifted into UTC.
    expect(onChange).toHaveBeenCalledWith("2026-03-16");
  });
});
