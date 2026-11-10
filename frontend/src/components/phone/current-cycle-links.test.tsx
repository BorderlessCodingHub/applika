import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CycleProvider } from "@/contexts/cycle-context";
import { PickPastCycle, ViewedCycle } from "@/test/phone-screens";
import { OpensOnCurrentCycle } from "./current-cycle-links";

vi.mock("@/services/services", () => ({
  services: {
    // The current cycle holds a1; a9 belongs to an archived cycle.
    applications: {
      getApplications: (cycleId?: string | null) =>
        Promise.resolve(cycleId ? [{ id: "a9" }] : [{ id: "a1" }]),
    },
  },
}));

function renderLinks() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CycleProvider>
        <PickPastCycle />
        <ViewedCycle />
        <OpensOnCurrentCycle>
          <a
            href="/applications?focus=a1"
            onClick={(event) => event.preventDefault()}
          >
            <span>Open current</span>
          </a>
          <a
            href="/applications?focus=a9"
            onClick={(event) => event.preventDefault()}
          >
            Open archived
          </a>
          <a href="/agenda" onClick={(event) => event.preventDefault()}>
            Agenda
          </a>
        </OpensOnCurrentCycle>
      </CycleProvider>
    </QueryClientProvider>,
  );
}

async function viewPastCycle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "pick past cycle" }));
  expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("c2");
}

describe("OpensOnCurrentCycle", () => {
  it("views the current cycle again before one of its applications opens", async () => {
    const user = userEvent.setup();
    renderLinks();
    await viewPastCycle(user);
    // The current cycle's list has arrived.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await user.click(screen.getByText("Open current"));

    await waitFor(() =>
      expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("current"),
    );
  });

  it("keeps the archive for an application that is not in the current cycle", async () => {
    const user = userEvent.setup();
    renderLinks();
    await viewPastCycle(user);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await user.click(screen.getByRole("link", { name: "Open archived" }));

    expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("c2");
  });

  it("leaves the cycle alone for any other link", async () => {
    const user = userEvent.setup();
    renderLinks();
    await viewPastCycle(user);

    await user.click(screen.getByRole("link", { name: "Agenda" }));

    expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("c2");
  });
});
