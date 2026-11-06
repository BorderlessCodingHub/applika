import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APPLICATION_CLOSE_COPY } from "@/components/applications/application-close-copy";
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

/**
 * The event form offers only interview, offer and denied: the create
 * description names those three and never notes or feedback.
 */
describe("TimelineEventDialog — create description", () => {
  it("names only the three event types the form offers", () => {
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
    expect(dialog).toHaveAccessibleDescription(
      "Record an interview, offer, or rejection for this application.",
    );
    expect(dialog).not.toHaveAccessibleDescription(/note|feedback/i);
  });
});

/**
 * The flag's dialog is this same shell in `close` mode: named "Close
 * application", described by the sentence that says closing is reversible,
 * with the same top-anchored `max-w-3xl` shape.
 */
describe("TimelineEventDialog — close mode", () => {
  it("is the Close application dialog, described as reversible, same shape", () => {
    render(
      <TimelineEventDialog
        open
        onOpenChange={() => {}}
        mode="close"
        footer={<button type="button">Close application</button>}
      >
        <div>body</div>
      </TimelineEventDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Close application" });
    expect(dialog).toHaveAccessibleDescription(
      APPLICATION_CLOSE_COPY.reversible,
    );
    expect(dialog).toHaveAccessibleDescription(/reversible/i);
    expect(dialog.className).toContain("sm:max-w-3xl");
    expect(dialog.className).toContain("top-4");
    // The RotateCcw icon sits beside the sentence and is hidden from AT.
    const icon = dialog.querySelector("svg.lucide-rotate-ccw");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("wraps its footer on narrow screens", () => {
    render(
      <TimelineEventDialog
        open
        onOpenChange={() => {}}
        mode="close"
        footer={<button type="button">Close application</button>}
      >
        <div>body</div>
      </TimelineEventDialog>,
    );
    const footer = screen
      .getByRole("button", { name: "Close application" })
      .closest('[data-slot="dialog-footer"]');
    expect(footer?.className).toContain("flex-wrap");
  });
});
