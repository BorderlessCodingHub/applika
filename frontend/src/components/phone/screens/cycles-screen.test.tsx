import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CyclesPage } from "@/app/(protected)/cycles/cycles-page";
import type { Cycle } from "@/services/types/cycles";
import type { GeneralStats } from "@/services/types/statistics";
import {
  SAM,
  ViewedCycle,
  renderPhonePage,
  renderPhoneScreen,
} from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  getCycles: vi.fn(),
  createCycle: vi.fn(),
  deleteCycle: vi.fn(),
  general: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/cycles";
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    cycles: {
      getCycles: mocks.getCycles,
      createCycle: mocks.createCycle,
      deleteCycle: mocks.deleteCycle,
    },
    statistics: { getGeneralStats: mocks.general },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const SPRING: Cycle = {
  id: "c1",
  name: "Spring 2026",
  created_at: "2026-05-02T10:00:00Z",
  updated_at: null,
} as Cycle;
const SUMMER: Cycle = {
  id: "c2",
  name: "Summer 2026",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: null,
} as Cycle;

const STATS: GeneralStats = {
  total_applications: 34,
  success_rate: 6,
  offers: 2,
  denials: 9,
  active: 12,
};

beforeEach(() => {
  mocks.getCycles.mockReset().mockResolvedValue([SUMMER, SPRING]);
  mocks.createCycle.mockReset().mockResolvedValue({ id: "c3" });
  mocks.deleteCycle.mockReset().mockResolvedValue(undefined);
  mocks.general.mockReset().mockResolvedValue(STATS);
});

const renderCycles = () =>
  renderPhoneScreen("/cycles", <CyclesPage />, { extra: <ViewedCycle /> });

describe("Cycles below md", () => {
  it("renders the Cycles board: the current cycle, then each archived one", async () => {
    await renderCycles();

    expect(
      screen.getByRole("heading", { level: 1, name: "Cycles" }),
    ).toBeInTheDocument();
    const current = screen.getByRole("region", { name: "Current Cycle" });
    expect(current).toHaveClass("ph-card", "ph-cy-current");
    expect(within(current).getByText("Active")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(current).getByText("34 applications · 2 offers · since Sep 1"),
      ).toHaveClass("ph-mono"),
    );
    expect(
      within(current).getByRole("button", { name: "New Cycle" }),
    ).toHaveAttribute("aria-haspopup", "dialog");

    const rows = document.querySelectorAll('li[data-slot="cycle-row"]');
    expect(
      Array.from(rows).map((row) => row.getAttribute("data-cycle-id")),
    ).toEqual(["c2", "c1"]);
    const spring = rows[1] as HTMLElement;
    expect(within(spring).getByText("Spring 2026")).toBeInTheDocument();
    expect(within(spring).getByText("Created May 2, 2026")).toBeVisible();
    const view = within(spring).getByRole("link", { name: "View" });
    expect(view).toHaveAttribute("href", "/applications");
    expect(view).toHaveAccessibleDescription("Spring 2026");
    expect(
      within(spring).getByRole("button", { name: "Delete Spring 2026" }),
    ).toHaveClass("ph-iconbtn");
  });

  it("hides New Cycle below 10 applications, as the desktop selector does", async () => {
    mocks.general.mockResolvedValue({ ...STATS, total_applications: 9 });
    await renderCycles();

    await screen.findByText(/9 applications/);
    expect(screen.queryByRole("button", { name: "New Cycle" })).toBeNull();
  });

  it("View shows that cycle", async () => {
    const user = userEvent.setup();
    await renderCycles();
    await screen.findByText("Spring 2026");

    const spring = document.querySelector<HTMLElement>(
      'li[data-cycle-id="c1"]',
    )!;
    await user.click(within(spring).getByRole("link", { name: "View" }));

    expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("c1");
  });

  it("starts a new cycle from its sheet, with a name", async () => {
    const user = userEvent.setup();
    await renderCycles();

    await user.click(await screen.findByRole("button", { name: "New Cycle" }));
    const sheet = screen.getByRole("dialog", { name: "Start a New Cycle" });
    const start = within(sheet).getByRole("button", { name: "Start Cycle" });
    expect(start).toHaveAttribute("aria-disabled", "true");
    await user.click(start);
    expect(mocks.createCycle).not.toHaveBeenCalled();

    await user.type(
      within(sheet).getByRole("textbox", { name: "Cycle name" }),
      "  Winter 2026  ",
    );
    expect(start).not.toHaveAttribute("aria-disabled");
    await user.click(start);

    expect(mocks.createCycle).toHaveBeenCalledWith({ name: "Winter 2026" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("current");
  });

  it("deletes an archived cycle after its sheet; Cancel first, the sheet stays while it runs", async () => {
    let finish: () => void = () => {};
    mocks.deleteCycle.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderCycles();
    await screen.findByText("Spring 2026");

    const trash = screen.getByRole("button", { name: "Delete Spring 2026" });
    await user.click(trash);
    let sheet = screen.getByRole("alertdialog", {
      name: "Delete cycle permanently?",
    });
    expect(sheet).toHaveTextContent("Spring 2026");
    const [cancel, confirm] = within(sheet).getAllByRole("button");
    expect(cancel).toHaveTextContent("Cancel");
    expect(cancel).toHaveFocus();
    expect(confirm).toHaveTextContent("Delete permanently");

    await user.click(cancel);
    expect(trash).toHaveFocus();
    expect(mocks.deleteCycle).not.toHaveBeenCalled();

    await user.click(trash);
    sheet = screen.getByRole("alertdialog");
    await user.click(
      within(sheet).getByRole("button", { name: "Delete permanently" }),
    );
    expect(mocks.deleteCycle).toHaveBeenCalledWith("c1");
    const pending = await within(sheet).findByRole("button", {
      name: "Deleting...",
    });
    expect(pending).toHaveAttribute("aria-busy", "true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    mocks.getCycles.mockResolvedValue([SUMMER]);
    finish();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(document.querySelector('li[data-cycle-id="c1"]')).toBeNull(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Cycles" }),
      ).toHaveFocus(),
    );
  });

  it("says there is no archived cycle yet", async () => {
    mocks.getCycles.mockResolvedValue([]);
    await renderCycles();

    expect(
      await screen.findByText("No archived cycles yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "When you start a new cycle, your current applications and reports are archived here.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("34 applications · 2 offers")).toBeVisible(),
    );
  });

  it("shows the cycles loading, then their failure with Retry", async () => {
    let fail: (error: unknown) => void = () => {};
    mocks.getCycles.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const user = userEvent.setup();
    await renderCycles();

    expect(
      document.querySelectorAll('[data-slot="phone-skeleton"]').length,
    ).toBeGreaterThan(0);
    fail({ response: { status: 500, data: { detail: "Cycles are down" } } });
    const errors = await screen.findAllByText("Cycles are down");
    expect(errors.length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(await screen.findByText("Spring 2026")).toBeInTheDocument();
  });

  it("renders today's page at md and up, and swaps when the width crosses md", async () => {
    const { viewport } = renderPhonePage(<CyclesPage />);
    await screen.findByText("Spring 2026");
    expect(document.querySelector('[data-slot="phone-cycles"]')).not.toBeNull();

    viewport.setPhone(false);

    expect(document.querySelector('[data-slot="phone-cycles"]')).toBeNull();
    expect(
      await screen.findAllByRole("button", { name: "Delete" }),
    ).toHaveLength(2);
  });
});
