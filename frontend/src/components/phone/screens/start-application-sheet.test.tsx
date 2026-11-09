import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  StartApplicationSheetView,
  type StartApplicationSheetViewProps,
} from "@/components/phone/screens/start-application-sheet";
import { mockPhoneViewport } from "@/test/phone";

/** v2/StartApplication's states, on the props of today's dialog. */

const JOB = { title: "Platform Engineer", company_name: "Globex" };

function renderSheet(props: Partial<StartApplicationSheetViewProps> = {}) {
  mockPhoneViewport();
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <StartApplicationSheetView
      open
      onOpenChange={onOpenChange}
      job={JOB}
      cvs={[
        {
          id: "7",
          name: "Backend CV",
          fit: 82,
          updatedAt: "2026-10-30T10:00:00Z",
        },
        { id: "8", name: "Frontend CV", fit: null, updatedAt: null },
      ]}
      canTailor
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { ...view, onOpenChange, onSubmit };
}

describe("StartApplicationSheetView", () => {
  it("draws the board: title 22/700, the X, the Master CV options and Without a CV, Cancel / Create draft", () => {
    renderSheet();
    const sheet = screen.getByRole("dialog", { name: "Start an application" });

    expect(within(sheet).getByText("Start an application")).toHaveClass(
      "ph-sa-title",
    );
    expect(within(sheet).getByRole("button", { name: "Close" })).toHaveClass(
      "ph-sa-close",
    );
    const cvs = within(sheet).getByRole("radiogroup", { name: "Master CV" });
    expect(
      within(cvs)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-checked")),
    ).toEqual(["false", "false", "true"]);
    expect(
      within(cvs).getByRole("radio", { name: "Backend CV" }),
    ).toHaveAccessibleDescription("Fit 82% · updated Oct 30");
    expect(
      within(cvs).getByRole("radio", { name: "Without a CV" }),
    ).toHaveAccessibleDescription("Pick a master CV on the next page.");
    // Two CVs: none preselected but "Without a CV" (today's rule), so no CV copy group.
    expect(
      within(sheet).queryByRole("radiogroup", { name: "CV copy" }),
    ).toBeNull();
    expect(
      within(sheet)
        .getAllByRole("button")
        .slice(-2)
        .map((button) => button.textContent),
    ).toEqual(["Cancel", "Create draft"]);
  });

  it("shows the CV copy choice once a CV is picked, Verbatim copy first", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole("radio", { name: "Backend CV" }));
    const copy = screen.getByRole("radiogroup", { name: "CV copy" });
    expect(
      within(copy).getByRole("radio", { name: "Verbatim copy" }),
    ).toBeChecked();
    expect(
      within(copy).getByRole("radio", { name: "Tailor by keywords" }),
    ).toHaveAccessibleDescription(
      "Puts the skills and bullets that match this job's keywords first. No text is added or removed.",
    );
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(onSubmit).toHaveBeenCalledWith({
      base_cv_id: "7",
      tailoring: "copy",
    });
  });

  it("says when there is no master CV, and offers Retry when they failed to load", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSheet({ cvs: [] });
    expect(
      screen.getByText(
        "You have no master CV yet. The draft starts without a CV copy.",
      ),
    ).toHaveClass("ph-sa-none");
    unmount();

    const onRetryCvs = vi.fn();
    renderSheet({ cvs: undefined, cvsError: "CVs are down", onRetryCvs });
    expect(screen.getByText("CVs are down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryCvs).toHaveBeenCalled();
  });

  it("cannot be closed while pending, and Create draft spins without dropping focus", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSubmit } = renderSheet({ isPending: true });

    const create = screen.getByRole("button", { name: "Create draft" });
    expect(create).toHaveAttribute("aria-disabled", "true");
    await user.click(create);
    expect(onSubmit).not.toHaveBeenCalled();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("aria-disabled", "true");
    await user.click(close);
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Cancel closes it", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("holds the conflict's place while the job refetches, then offers Open application", () => {
    const { rerender, onOpenChange, onSubmit } = renderSheet({
      conflict: { application: null, isLoading: true },
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "You already have an application for this job",
    );
    expect(alert).toHaveFocus();
    expect(within(alert).queryByRole("link")).toBeNull();

    rerender(
      <StartApplicationSheetView
        open
        onOpenChange={onOpenChange}
        job={JOB}
        cvs={[]}
        canTailor
        onSubmit={onSubmit}
        conflict={{ application: { id: "a1", is_draft: false } }}
      />,
    );
    expect(
      within(screen.getByRole("alert")).getByRole("link", {
        name: "Open application",
      }),
    ).toHaveAttribute("href", "/applications?focus=a1");
  });
});
