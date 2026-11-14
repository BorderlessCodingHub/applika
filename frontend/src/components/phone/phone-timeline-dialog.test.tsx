import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { mockPhoneViewport } from "@/test/phone";
import { PhoneTimelineDialog } from "./phone-timeline-dialog";

vi.mock("@/services/services", () => ({
  services: {
    timeline: { list: () => Promise.resolve([]) },
    applications: { finalize: vi.fn() },
  },
}));

/** Today's form, for real: an opener that may leave, and a fallback. */
function Harness({ removeOpenerOnClose = false }) {
  const [open, setOpen] = useState(false);
  const [openerShown, setOpenerShown] = useState(true);
  return (
    <>
      {openerShown ? (
        <button
          type="button"
          data-testid="opener"
          onClick={() => setOpen(true)}
        >
          Log update
        </button>
      ) : null}
      <div tabIndex={-1} data-testid="fallback">
        list
      </div>
      {open ? (
        <PhoneTimelineDialog
          applicationId="a1"
          purpose="event"
          onOpenChange={(next) => {
            if (next) return;
            setOpen(false);
            if (removeOpenerOnClose) {
              window.setTimeout(() => setOpenerShown(false), 0);
            }
          }}
          opener={() => document.querySelector('[data-testid="opener"]')}
          fallbackFocus={() =>
            document.querySelector('[data-testid="fallback"]')
          }
        />
      ) : null}
    </>
  );
}

function renderHarness(removeOpenerOnClose = false) {
  mockPhoneViewport();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Harness removeOpenerOnClose={removeOpenerOnClose} />
    </QueryClientProvider>,
  );
}

describe("PhoneTimelineDialog", () => {
  it("is today's Add event dialog, and gives focus back to its opener on Escape", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByTestId("opener"));
    expect(
      await screen.findByRole("dialog", { name: "Add event" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("opener")).toHaveFocus();
  });

  it("moves focus to the fallback when the opener leaves after closing", async () => {
    const user = userEvent.setup();
    renderHarness(true);

    await user.click(screen.getByTestId("opener"));
    await screen.findByRole("dialog", { name: "Add event" });
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByTestId("opener")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByTestId("fallback")).toHaveFocus());
  });
});
