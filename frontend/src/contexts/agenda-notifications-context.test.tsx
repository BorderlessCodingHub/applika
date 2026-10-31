import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgendaNotificationsProvider } from "@/contexts/agenda-notifications-context";
import { loadMessages } from "@/i18n/load-messages";
import { setTranslatorLocale } from "@/i18n/translator";
import type { AgendaStep } from "@/services/types/applications";

const useAgendaMock = vi.fn();
vi.mock("@/hooks/use-user", () => ({
  useAgenda: (...args: unknown[]) => useAgendaMock(...args),
}));

const notificationMock = vi.fn();

// 2026-09-18 09:29 local; the step starts at 10:00 the same day, local zone.
const NOW = new Date("2026-09-18T09:29:00");

function step(): AgendaStep {
  return {
    id: "s1",
    step_date: "2026-09-18",
    start_time: "10:00:00",
    event_type: "interview",
    interview_type: "technical",
    application_id: "app-1",
    company_name: "Acme",
    role: "Backend Engineer",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.setItem("agenda-notifications", JSON.stringify(["s1"]));
  useAgendaMock.mockReturnValue({ data: [step()] });
  notificationMock.mockClear();
  vi.stubGlobal(
    "Notification",
    Object.assign(notificationMock, { permission: "granted" }),
  );
  vi.stubGlobal(
    "Audio",
    vi.fn(() => ({ play: () => Promise.resolve() })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AgendaNotificationsProvider", () => {
  it("writes the alert in English by default", () => {
    render(<AgendaNotificationsProvider>{null}</AgendaNotificationsProvider>);
    vi.advanceTimersByTime(60_000);
    expect(notificationMock).toHaveBeenCalledWith(
      "Acme — Interview - Technical",
      { body: "Starts in 30 minutes" },
    );
  });

  it("writes the alert in Portuguese; the company name stays as sent", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    render(<AgendaNotificationsProvider>{null}</AgendaNotificationsProvider>);
    vi.advanceTimersByTime(60_000);
    expect(notificationMock).toHaveBeenCalledWith(
      "Acme — Entrevista - Técnica",
      { body: "Começa em 30 minutos" },
    );
  });
});
