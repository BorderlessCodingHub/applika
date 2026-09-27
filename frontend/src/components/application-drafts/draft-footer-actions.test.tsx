import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DraftFooterActions } from "@/components/application-drafts/draft-footer-actions";

/**
 * KODI-036, step 1 Cancel (orchestrator decision, option C'): a plain
 * `LinkButton` to `/applications`. When closing the tab right now would lose
 * unsaved work (`hasUnsavedRisk`), the click is intercepted and replaced with
 * `window.location.assign` — a real top-level navigation, so the page's own
 * `beforeunload` guard gets a chance to fire, unlike a Next.js client-side
 * transition. With nothing at risk, it is a plain link (no interception).
 */

describe("DraftFooterActions — step 1 Cancel", () => {
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderFooter(hasUnsavedRisk: boolean) {
    return render(
      <DraftFooterActions
        step="application"
        canContinue={false}
        onContinue={vi.fn()}
        onBack={vi.fn()}
        hasUnsavedRisk={hasUnsavedRisk}
        missing={[]}
        onFinish={vi.fn()}
      />,
    );
  }

  it("links straight to /applications when nothing is at risk", async () => {
    const user = userEvent.setup();
    renderFooter(false);

    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/applications");

    await user.click(cancel);

    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("forces a real top-level navigation via window.location.assign when unsaved work is at risk", async () => {
    const user = userEvent.setup();
    renderFooter(true);

    const cancel = screen.getByRole("link", { name: "Cancel" });
    await user.click(cancel);

    expect(assignSpy).toHaveBeenCalledWith("/applications");
  });

  it("renders Continue to CV beside Cancel on step 1", () => {
    renderFooter(false);
    expect(
      screen.getByRole("button", { name: /continue to cv/i }),
    ).toBeInTheDocument();
  });
});
