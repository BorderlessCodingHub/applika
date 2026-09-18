import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { FinalizeDialog } from "@/components/applications/finalize-dialog";
import { FINALIZE_REVERSIBLE_COPY } from "@/components/applications/application-close-copy";

/**
 * PRD 0008 / ADR 0012, R-032 (T046): the close-application dialog is an
 * OUTCOME PICKER, not a confirm-only dialog — the plan's original
 * confirm-only finalize line is superseded by the owner's 2026-09-18
 * decision. Pins: the confirmation always says "reversible" (AC7/AC11); the
 * outcome gates which fields show (none: nothing extra; denied: date +
 * observation; offer: + the salary triad with the 20 currencies and
 * monthly|annually only).
 */

vi.mock("@/services/services", () => ({
  services: {
    applications: {
      finalize: vi.fn(),
      reopen: vi.fn(),
    },
  },
}));

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(
    <FinalizeDialog applicationId="app-1" open onOpenChange={() => {}} />,
    { wrapper: Wrapper },
  );
}

describe("FinalizeDialog — reversible copy (AC7/AC11)", () => {
  it("always says closing is reversible", () => {
    renderDialog();
    expect(screen.getByText(FINALIZE_REVERSIBLE_COPY)).toBeInTheDocument();
    expect(screen.getByText(FINALIZE_REVERSIBLE_COPY).textContent).toMatch(
      /reversible/i,
    );
  });
});

describe("FinalizeDialog — outcome-gated fields (R-032)", () => {
  it("defaults to None with no date/observation/salary fields", () => {
    renderDialog();
    expect(screen.getByRole("radio", { name: "None" })).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
  });

  it("Denied reveals date + observation but no salary triad", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Currency" }),
    ).not.toBeInTheDocument();
  });

  it("Offer reveals date, observation and the full salary triad", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Currency" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Annually" })).toBeInTheDocument();
    // Only monthly|annually — never hourly (offer salary period restriction).
    expect(
      screen.queryByRole("radio", { name: "Hourly" }),
    ).not.toBeInTheDocument();
  });

  it("Offer's currency select lists all 20 currencies", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    expect(screen.getAllByRole("option")).toHaveLength(20);
  });
});
