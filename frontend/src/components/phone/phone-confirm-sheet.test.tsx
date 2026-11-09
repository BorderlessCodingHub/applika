import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { mockPhoneViewport } from "@/test/phone";
import { PhoneConfirmSheet } from "./phone-confirm-sheet";

function Harness({
  pending = false,
  onConfirm = vi.fn(),
  closeOnConfirm = true,
  removeOpener = false,
}: {
  pending?: boolean;
  onConfirm?: () => void;
  closeOnConfirm?: boolean;
  removeOpener?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState(true);
  const fallback = useRef<HTMLHeadingElement>(null);
  return (
    <>
      <h1 ref={fallback} tabIndex={-1}>
        Cycles
      </h1>
      {opener ? (
        <button type="button" onClick={() => setOpen(true)}>
          Delete Spring 2026
        </button>
      ) : null}
      <PhoneConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title="Delete cycle permanently?"
        description="Spring 2026 and its applications are deleted."
        cancelLabel="Cancel"
        confirmLabel="Delete Cycle"
        pendingLabel="Deleting..."
        pending={pending}
        confirmAction="confirm-delete"
        fallbackFocus={fallback}
        onConfirm={() => {
          onConfirm();
          if (removeOpener) setOpener(false);
          if (closeOnConfirm) setOpen(false);
        }}
      />
    </>
  );
}

describe("PhoneConfirmSheet", () => {
  it("is an alert dialog named and described, with Cancel first and focused", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Delete Spring 2026" }),
    );
    const sheet = screen.getByRole("alertdialog", {
      name: "Delete cycle permanently?",
    });
    expect(sheet).toHaveAccessibleDescription(
      "Spring 2026 and its applications are deleted.",
    );
    const [cancel, confirm] = Array.from(sheet.querySelectorAll("button"));
    expect(cancel).toHaveTextContent("Cancel");
    expect(confirm).toHaveTextContent("Delete Cycle");
    expect(confirm).toHaveAttribute("data-action", "confirm-delete");
    expect(confirm).toHaveClass("ph-dan");
    expect(cancel).toHaveFocus();
  });

  it("Cancel closes it and hands focus back to the opener", async () => {
    mockPhoneViewport();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);

    const opener = screen.getByRole("button", { name: "Delete Spring 2026" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it("confirms, and lands on the fallback when the opener is gone", async () => {
    mockPhoneViewport();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} removeOpener />);

    await user.click(
      screen.getByRole("button", { name: "Delete Spring 2026" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete Cycle" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cycles" })).toHaveFocus();
  });

  it("while pending both buttons are aria-disabled and do nothing", async () => {
    mockPhoneViewport();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness pending onConfirm={onConfirm} closeOnConfirm={false} />);

    await user.click(
      screen.getByRole("button", { name: "Delete Spring 2026" }),
    );
    const sheet = screen.getByRole("alertdialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Deleting..." });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveAttribute("aria-busy", "true");
    await user.click(confirm);
    await user.click(cancel);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(sheet).toBeInTheDocument();
  });

  it("primary tone draws the primary button", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    function Primary() {
      const [open, setOpen] = useState(true);
      return (
        <PhoneConfirmSheet
          open={open}
          onOpenChange={setOpen}
          title="Sign out?"
          description="This browser signs out."
          cancelLabel="Cancel"
          confirmLabel="Sign out"
          tone="primary"
          onConfirm={() => setOpen(false)}
        />
      );
    }
    render(<Primary />);
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveClass(
      "ph-pri",
    );
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
