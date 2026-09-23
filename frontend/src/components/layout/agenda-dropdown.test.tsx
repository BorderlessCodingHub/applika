import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AgendaDropdown } from "@/components/layout/agenda-dropdown";
import type { AgendaStep } from "@/services/types/applications";

/**
 * PRD 0008 / ADR 0012, AC6 (R-026): the agenda dropdown labels each item from
 * `event_type`/`interview_type` (`stageLabel`), never from the now-nullable,
 * legacy `step_name`/`step_color`.
 */

const useAgendaMock = vi.fn();
vi.mock("@/hooks/use-user", () => ({
  useAgenda: (...args: unknown[]) => useAgendaMock(...args),
}));

function agendaItem(overrides: Partial<AgendaStep> = {}): AgendaStep {
  return {
    id: "1",
    step_id: null,
    step_date: new Date().toISOString().slice(0, 10),
    step_name: null,
    step_color: null,
    event_type: "interview",
    interview_type: "technical",
    application_id: "app-1",
    company_name: "Acme",
    role: "Backend engineer",
    ...overrides,
  };
}

describe("AgendaDropdown — labels from event_type/interview_type", () => {
  it("labels an interview item with stageLabel even though step_name is null", async () => {
    useAgendaMock.mockReturnValue({ data: [agendaItem()] });
    const user = userEvent.setup();
    render(<AgendaDropdown />);

    await user.click(screen.getByRole("button", { name: /upcoming steps/i }));

    expect(screen.getByText("Interview · Technical")).toBeInTheDocument();
  });

  it("labels an offer item as Offer (no interview_type)", async () => {
    useAgendaMock.mockReturnValue({
      data: [
        agendaItem({
          id: "2",
          event_type: "offer",
          interview_type: null,
        }),
      ],
    });
    const user = userEvent.setup();
    render(<AgendaDropdown />);

    await user.click(screen.getByRole("button", { name: /upcoming steps/i }));

    expect(screen.getByText("Offer")).toBeInTheDocument();
  });
});
