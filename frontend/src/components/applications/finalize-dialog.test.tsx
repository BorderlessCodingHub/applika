import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FinalizeDialog,
  toFinalizePayload,
} from "@/components/applications/finalize-dialog";
import { FINALIZE_REVERSIBLE_COPY } from "@/components/applications/application-close-copy";
import { services } from "@/services/services";

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

beforeEach(() => {
  vi.mocked(services.applications.finalize).mockReset();
  vi.mocked(services.applications.reopen).mockReset();
});

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

  it("Denied reveals the reason select, defaulted to Unknown (AC4, KODI-014)", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    const select = screen.getByRole("combobox", { name: "Reason" });
    expect(select).toBeInTheDocument();
    expect(select).toHaveTextContent("Unknown");
  });

  it("None and Offer show no reason select", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(
      screen.queryByRole("combobox", { name: "Reason" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    expect(
      screen.queryByRole("combobox", { name: "Reason" }),
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

describe("FinalizeDialog — server-limit parity (mirrors FinalizeWithOutcome)", () => {
  it("blocks save on an amount with more than 2 decimal places", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.type(screen.getByLabelText("Amount"), "100.555");
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(screen.getAllByRole("option")[0]);
    await user.click(screen.getByRole("radio", { name: "Monthly" }));

    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() =>
      expect(services.applications.finalize).not.toHaveBeenCalled(),
    );
  });

  it("blocks save on an observation longer than 5000 characters", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "a".repeat(5001) },
    });

    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() =>
      expect(services.applications.finalize).not.toHaveBeenCalled(),
    );
  });

  it("a stale over-limit note left over from Denied does not block a None close", async () => {
    // `none` unmounts the notes field — a value typed while Denied was
    // selected must not silently block the close once switched back to None,
    // since there is nothing left on screen the user could fix.
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue({
      id: "app-1",
    } as never);
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "a".repeat(5001) },
    });
    await user.click(screen.getByRole("radio", { name: "None" }));

    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        undefined,
      ),
    );
  });
});

type FinalizeValues = Parameters<typeof toFinalizePayload>[0];

function values(overrides: Partial<FinalizeValues>): FinalizeValues {
  return {
    outcome: "none",
    event_date: "2026-09-10",
    observation: "",
    salary_amount: "",
    salary_currency: "",
    salary_period: "",
    denied_reason: "unknown",
    ...overrides,
  } as FinalizeValues;
}

describe("toFinalizePayload (AC11, R-032, AC4/KODI-014)", () => {
  it("none sends no body at all", () => {
    expect(toFinalizePayload(values({ outcome: "none" }))).toBeUndefined();
  });

  it("denied sends the date, observation and denied_reason, never salary keys", () => {
    const payload = toFinalizePayload(
      values({ outcome: "denied", observation: "  Not a fit  " }),
    );
    expect(payload).toEqual({
      outcome: "denied",
      event_date: "2026-09-10",
      observation: "Not a fit",
      denied_reason: "unknown",
    });
    expect(payload).not.toHaveProperty("salary_amount");
    expect(payload).not.toHaveProperty("salary_currency");
    expect(payload).not.toHaveProperty("salary_period");
  });

  it("denied sends the picked reason", () => {
    const payload = toFinalizePayload(
      values({ outcome: "denied", denied_reason: "salary_mismatch" }),
    );
    expect(payload).toMatchObject({
      outcome: "denied",
      denied_reason: "salary_mismatch",
    });
  });

  it("offer sends the salary triad and never denied_reason", () => {
    const payload = toFinalizePayload(
      values({
        outcome: "offer",
        salary_amount: " 120000 ",
        salary_currency: "SEK",
        salary_period: "annually",
      }),
    );
    expect(payload).toEqual({
      outcome: "offer",
      event_date: "2026-09-10",
      observation: undefined,
      salary_amount: "120000",
      salary_currency: "SEK",
      salary_period: "annually",
    });
    expect(payload).not.toHaveProperty("denied_reason");
  });
});

describe("FinalizeDialog — outcome date (AC11)", () => {
  it("defaults the date to today and disables tomorrow", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    const trigger = screen.getByLabelText("Date");
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(trigger).toHaveTextContent(iso);

    await user.click(trigger);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    // Only assert when tomorrow is in the month the calendar opened on.
    if (tomorrow.getMonth() === today.getMonth()) {
      const cells = screen
        .getAllByRole("button")
        .filter(
          (b) =>
            b.closest('[role="grid"]') &&
            b.textContent === String(tomorrow.getDate()),
        );
      expect(cells.length).toBeGreaterThan(0);
      expect(cells[0]).toBeDisabled();
    }
  });
});

describe("FinalizeDialog — denied reason end to end (AC4, KODI-014)", () => {
  it("sends denied_reason 'unknown' when the select is left untouched", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue({
      id: "app-1",
    } as never);
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          outcome: "denied",
          denied_reason: "unknown",
        }),
      ),
    );
  });

  it("sends the picked reason", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue({
      id: "app-1",
    } as never);
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("combobox", { name: "Reason" }));
    await user.click(
      await screen.findByRole("option", { name: "Salary mismatch" }),
    );
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          outcome: "denied",
          denied_reason: "salary_mismatch",
        }),
      ),
    );
  });

  it("never sends denied_reason for an Offer close", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue({
      id: "app-1",
    } as never);
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    await user.type(screen.getByLabelText("Amount"), "1000");
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click((await screen.findAllByRole("option"))[0]);
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalled(),
    );
    const [, payload] = vi.mocked(services.applications.finalize).mock.calls[0];
    expect(payload).not.toHaveProperty("denied_reason");
  });

  it("a None close sends no body, and no denied_reason", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue({
      id: "app-1",
    } as never);
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        undefined,
      ),
    );
  });
});
