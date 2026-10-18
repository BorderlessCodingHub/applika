import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimelinePanel } from "@/components/timeline/timeline-panel";

/**
 * The event form offers only interview, offer and denied: the empty timeline
 * invites the user to log those three and never notes or feedback.
 */
describe("TimelinePanel — empty state description", () => {
  it("names only the three event types the form offers", () => {
    render(<TimelinePanel events={[]} />);

    expect(screen.getByText("No events yet")).toBeInTheDocument();
    const description = screen.getByText(
      "Log interviews, offers, and rejections to build the story of this application.",
    );
    expect(description).toBeInTheDocument();
    expect(description.textContent).not.toMatch(/note|feedback/i);
  });
});
