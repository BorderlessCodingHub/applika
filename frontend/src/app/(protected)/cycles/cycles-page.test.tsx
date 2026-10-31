import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { CyclesPage, formatCycleDate } from "./cycles-page";

/**
 * `/cycles` in Portuguese: words translated, the creation date written the
 * Brazilian way, and the cycle's name (user content) shown as typed.
 */

vi.mock("@/hooks/use-cycles", () => ({
  useCycles: () => ({
    isLoading: false,
    data: [
      {
        id: "c1",
        name: "Summer search 2026",
        created_at: "2026-10-15T12:00:00Z",
      },
    ],
  }),
  useDeleteCycle: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({ setSelectedCycleId: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("/cycles", () => {
  it("translates the page and writes the date in Portuguese", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(<CyclesPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Ciclos" }),
    ).toBeVisible();
    expect(screen.getByText("Summer search 2026")).toBeVisible();
    expect(screen.getByText("Criado em 15 de out. de 2026")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ver" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Excluir o ciclo permanentemente?",
      }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "Isto excluirá permanentemente Summer search 2026 e todas",
    );
    expect(
      within(dialog).getByRole("button", { name: "Excluir permanentemente" }),
    ).toBeVisible();
  });

  it("keeps the English words and date", () => {
    render(<CyclesPage />);

    expect(screen.getByText("Created Oct 15, 2026")).toBeVisible();
    expect(formatCycleDate("2026-10-15T12:00:00Z", "pt-BR")).toBe(
      "15 de out. de 2026",
    );
  });
});
