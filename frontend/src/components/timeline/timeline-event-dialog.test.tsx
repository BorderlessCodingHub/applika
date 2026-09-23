import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimelineEventDialog } from "@/components/timeline/timeline-event-dialog";

/**
 * PRD 0008 / ADR 0012, KODI-014 (AC1): the create/edit event dialog is
 * `max-w-3xl` wide from `sm`, anchored to the top (not centred), with a
 * bounded height so only its body scrolls.
 */
describe("TimelineEventDialog — width (AC1)", () => {
  it("is max-w-3xl from sm, and top-anchored with a bounded height", () => {
    render(
      <TimelineEventDialog
        open
        onOpenChange={() => {}}
        mode="create"
        footer={<button type="button">Save</button>}
      >
        <div>body</div>
      </TimelineEventDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Add event" });
    expect(dialog.className).toContain("sm:max-w-3xl");
    expect(dialog.className).toContain("top-4");
    expect(dialog.className).toContain("sm:top-[8dvh]");
    expect(dialog.className).toContain("max-h-[calc(100dvh-2rem)]");
  });

  it("uses the edit title when mode is edit", () => {
    render(
      <TimelineEventDialog
        open
        onOpenChange={() => {}}
        mode="edit"
        footer={<button type="button">Save</button>}
      >
        <div>body</div>
      </TimelineEventDialog>,
    );

    expect(
      screen.getByRole("dialog", { name: "Edit event" }),
    ).toBeInTheDocument();
  });
});
