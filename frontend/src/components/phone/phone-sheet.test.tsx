import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { mockPhoneViewport } from "@/test/phone";
import {
  PhoneSheet,
  PhoneSheetClose,
  PhoneSheetDescription,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "./phone-sheet";

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open sheet
      </button>
      <PhoneSheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="Quick add"
        showClose
      >
        <p>sheet body</p>
      </PhoneSheet>
    </>
  );
}

describe("PhoneSheet", () => {
  it("is a dialog named by its title, with the board's Close", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "open sheet" }));
    const sheet = screen.getByRole("dialog", { name: "Quick add" });
    expect(sheet).toHaveTextContent("sheet body");
    expect(sheet).not.toHaveAttribute("aria-describedby");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes itself when the screen turns past md", async () => {
    const viewport = mockPhoneViewport();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "open sheet" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    viewport.setPhone(false);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes wherever the phone query misses, the 767.84-768px band included", async () => {
    // No mockPhoneViewport: setup.ts answers every query false, so neither the
    // phone query nor "(min-width: 48rem)" matches, as in that band.
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "open sheet" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hands focus back to the control that opened it", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "open sheet" });

    await user.click(opener);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

/** A sheet opened from a row of another sheet, as the Application's More → Delete. */
function ChainHarness() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  const fallback = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={fallback} type="button" onClick={() => setFirst(true)}>
        more
      </button>
      <PhoneSheet open={first} onOpenChange={setFirst} title="Actions">
        <button
          type="button"
          onClick={() => {
            setFirst(false);
            setSecond(true);
          }}
        >
          delete row
        </button>
      </PhoneSheet>
      <PhoneSheet
        open={second}
        onOpenChange={setSecond}
        alert
        title="Delete it?"
        description="This cannot be undone."
        fallbackFocus={fallback}
      >
        <PhoneSheetClose>cancel</PhoneSheetClose>
      </PhoneSheet>
    </>
  );
}

describe("PhoneSheet on the frame", () => {
  it("falls back to the given control when the one that opened it is gone", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    render(<ChainHarness />);

    await user.click(screen.getByRole("button", { name: "more" }));
    await user.click(screen.getByRole("button", { name: "delete row" }));
    const alert = screen.getByRole("alertdialog", { name: "Delete it?" });
    expect(alert).toHaveAccessibleDescription("This cannot be undone.");

    await user.click(screen.getByRole("button", { name: "cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "more" })).toHaveFocus();
  });

  it("lets a board draw its own head and footer on the frame, with its own scrim", async () => {
    mockPhoneViewport();
    render(
      <PhoneSheetFrame
        open
        onOpenChange={() => {}}
        described
        scrimClassName="ph-qa-scrim"
        className="ph-qa-sheet"
      >
        <PhoneSheetTitle>Add application</PhoneSheetTitle>
        <PhoneSheetDescription>Just the essentials.</PhoneSheetDescription>
      </PhoneSheetFrame>,
    );

    const sheet = screen.getByRole("dialog", { name: "Add application" });
    expect(sheet).toHaveAccessibleDescription("Just the essentials.");
    expect(sheet).toHaveClass("ph-sheet", "ph-qa-sheet");
    expect(
      document.querySelector('[data-slot="phone-sheet-scrim"]'),
    ).toHaveClass("ph-scrim", "ph-qa-scrim");
  });
});
