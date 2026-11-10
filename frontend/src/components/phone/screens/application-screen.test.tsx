import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationsRoute from "@/app/(protected)/applications/page";
import type { Application } from "@/services/types/applications";
import type { TimelineEvent } from "@/services/types/timeline";
import type { User } from "@/services/types/users";
import { setLocation } from "@/test/navigation";
import {
  PickPastCycle,
  SAM,
  WITH_CVS,
  renderPhoneScreen,
} from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  getApplications: vi.fn(),
  timeline: vi.fn(),
  deleteApplication: vi.fn(),
  reopen: vi.fn(),
  ics: vi.fn(),
  toastSuccess: vi.fn(),
  features: [] as { key: string; stage: string }[],
}));

let currentUser: User = SAM;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/applications";
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    applications: {
      getApplications: mocks.getApplications,
      deleteApplication: mocks.deleteApplication,
      reopen: mocks.reopen,
    },
    applicationDrafts: { list: () => Promise.resolve([]) },
    cycles: {
      getCycles: () =>
        Promise.resolve([
          { id: "c2", name: "Fall 2026", created_at: "", updated_at: null },
        ]),
    },
    features: { getMine: () => Promise.resolve(mocks.features) },
    platforms: {
      list: () => Promise.resolve([{ id: "p1", name: "LinkedIn", url: null }]),
    },
    timeline: { list: mocks.timeline },
  },
}));

vi.mock("@/lib/calendar", () => ({ genAgendaStepIcsFile: mocks.ics }));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/timeline/timeline-event-form", async () => ({
  TimelineEventForm: (await import("@/test/timeline-dialog-stub"))
    .TimelineEventFormStub,
}));

// Today's edit sheet is tested on its own (application-form-sheet.test.tsx).
vi.mock("@/components/applications/application-form-sheet", () => ({
  ApplicationFormSheet: ({ application }: { application: Application }) => (
    <div role="dialog" aria-label="Edit Application">
      {application.company_name}
    </div>
  ),
}));

// Sunday 25 October 2026, 11:45.
const NOW = new Date(2026, 9, 25, 11, 45);

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    company_id: null,
    company_name: "Northwind Labs",
    platform_id: "p1",
    role: "Senior Backend Engineer",
    mode: "active",
    application_date: "2026-10-18",
    link_to_job: "https://jobs.example.com/northwind",
    work_mode: "remote",
    country: "Portugal",
    experience_level: "senior",
    currency: "EUR",
    salary_period: "annually",
    salary_range_min: 60000,
    salary_range_max: 75000,
    observation: "Review Kafka basics before the technical round.",
    finalized: false,
    finalized_at: null,
    last_step: { id: "s", name: "Phase 2", color: "#000", date: "2026-10-25" },
    ...overrides,
  };
}

function event(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: "e1",
    application_id: "a1",
    user_id: "u1",
    event_type: "interview",
    interview_type: "technical",
    denied_reason: null,
    event_date: "2026-10-25",
    start_time: "14:00:00",
    end_time: "15:00:00",
    observation: null,
    salary_period: null,
    salary_amount: null,
    salary_currency: null,
    created_at: "2026-10-20T10:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

const EVENTS: TimelineEvent[] = [
  event({ id: "tech" }),
  event({
    id: "screen",
    interview_type: "initial_screening",
    event_date: "2026-10-21",
    start_time: "10:30:00",
    end_time: "11:00:00",
  }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setLocation("/applications?focus=a1");
  currentUser = SAM;
  mocks.features = [];
  mocks.getApplications.mockReset().mockResolvedValue([app()]);
  mocks.timeline.mockReset().mockResolvedValue(EVENTS);
  mocks.deleteApplication.mockReset().mockResolvedValue(undefined);
  mocks.reopen.mockReset().mockResolvedValue(app());
  mocks.ics.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderApplication(
  options: Parameters<typeof renderPhoneScreen>[2] = {},
) {
  return renderPhoneScreen("/applications", <ApplicationsRoute />, options);
}

describe("ApplicationScreen", () => {
  it("heads it with the company, the role, the date and the platform, and the stage reached", async () => {
    await renderApplication();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Northwind Labs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
    expect(
      await screen.findByText("Applied Oct 18 via LinkedIn"),
    ).toBeInTheDocument();
    const progress = screen.getByRole("region", { name: "Stage progress" });
    await waitFor(() =>
      expect(
        within(progress).getByText("Technical").closest("li"),
      ).toHaveAttribute("aria-current", "step"),
    );
    expect(
      within(progress).getByText("Screening").closest("li"),
    ).toHaveAttribute("data-reached", "true");
    expect(
      within(progress).getByText("Offer").closest("li"),
    ).not.toHaveAttribute("data-reached");
  });

  it("draws no tab bar and no Add, and its own back to Pipeline", async () => {
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    expect(document.querySelector('[data-slot="phone-tab-bar"]')).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "href",
      "/applications",
    );
  });

  it("shows the next step with add to calendar", async () => {
    const user = userEvent.setup();
    await renderApplication();

    const next = await screen.findByRole("region", {
      name: "Technical interview",
    });
    expect(next).toHaveTextContent("Next step · today");
    expect(next).toHaveTextContent("Sun, Oct 25 · 14:00 – 15:00");
    await user.click(
      within(next).getByRole("button", { name: "Add to calendar" }),
    );
    expect(mocks.ics).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tech",
        step_date: "2026-10-25",
        start_time: "14:00:00",
        company_name: "Northwind Labs",
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Calendar event downloaded",
    );
  });

  it("lists the details that are filled in, the posting link, the history and the notes", async () => {
    await renderApplication();

    const details = await screen.findByRole("region", { name: "Details" });
    const rows = within(details)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ["Source", "Active"],
      ["Work mode", "Remote"],
      ["Country", "Portugal"],
      ["Experience", "Senior"],
      ["Salary range", expect.stringContaining("60,000")],
    ]);
    expect(
      within(details).getByRole("link", { name: /job posting/i }),
    ).toHaveAttribute("href", "https://jobs.example.com/northwind");

    const history = screen.getByRole("region", { name: "History" });
    await waitFor(() =>
      expect(
        within(history)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        "Technical interviewOct 25 · scheduled",
        "Initial screeningOct 21 · passed",
        "AppliedOct 18",
      ]),
    );
    expect(screen.getByRole("region", { name: "Notes" })).toHaveTextContent(
      "Review Kafka basics before the technical round.",
    );
  });

  it("leaves out a detail that is not filled in", async () => {
    mocks.getApplications.mockResolvedValue([
      app({
        country: undefined,
        salary_range_min: undefined,
        salary_range_max: undefined,
        link_to_job: undefined,
        observation: undefined,
      }),
    ]);
    await renderApplication();

    const details = await screen.findByRole("region", { name: "Details" });
    expect(within(details).queryByText("Country")).not.toBeInTheDocument();
    expect(within(details).queryByText("Salary range")).not.toBeInTheDocument();
    expect(within(details).queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Notes" }),
    ).not.toBeInTheDocument();
  });

  it("offers Close and Log update through today's dialog", async () => {
    const user = userEvent.setup();
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    await user.click(screen.getByRole("button", { name: "Log update" }));
    expect(
      screen.getByRole("dialog", { name: "Add event" }),
    ).toBeInTheDocument();
  });

  it("closes through the close dialog", async () => {
    const user = userEvent.setup();
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    const close = document.querySelector<HTMLElement>(
      '[data-action="close-application"]',
    )!;
    expect(close).toHaveAccessibleName("Close");
    await user.click(close);
    expect(
      screen.getByRole("dialog", { name: "Close application" }),
    ).toBeInTheDocument();
  });

  it("hands focus back to Log update when its dialog closes", async () => {
    const user = userEvent.setup();
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });
    const logUpdate = screen.getByRole("button", { name: "Log update" });

    await user.click(logUpdate);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(logUpdate).toHaveFocus();
  });

  it("lands on Reopen once Close has closed the application", async () => {
    const user = userEvent.setup();
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    await user.click(
      document.querySelector<HTMLElement>('[data-action="close-application"]')!,
    );
    mocks.getApplications.mockResolvedValue([
      app({ finalized: true, finalized_at: "2026-10-25T12:00:00Z" }),
    ]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    const reopen = await screen.findByRole("button", { name: "Reopen" });
    await waitFor(() => expect(reopen).toHaveFocus());
  });

  it("offers Reopen only on a closed application, and no update (PRD 0021 edge case)", async () => {
    const user = userEvent.setup();
    mocks.getApplications.mockResolvedValue([
      app({
        finalized: true,
        finalized_at: "2026-10-24T10:00:00Z",
        last_step: {
          id: "s",
          name: "Offer",
          color: "#000",
          date: "2026-10-24",
        },
      }),
    ]);
    mocks.timeline.mockResolvedValue([
      event({
        id: "offer",
        event_type: "offer",
        interview_type: null,
        event_date: "2026-10-24",
        start_time: undefined,
        end_time: undefined,
      }),
    ]);
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    expect(screen.getByText("Closed · Offer")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log update" }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-action="close-application"]'),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: /Next step/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(mocks.reopen).toHaveBeenCalledWith("a1"));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Application reopened"),
    );
  });

  it("marks an open application whose latest event is a denial Denied (PRD 0021 edge case)", async () => {
    mocks.getApplications.mockResolvedValue([
      app({
        last_step: {
          id: "s",
          name: "Denied",
          color: "#000",
          date: "2026-10-24",
        },
      }),
    ]);
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    expect(screen.getByText("Denied")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log update" }),
    ).toBeInTheDocument();
  });

  it("edits through today's sheet from More", async () => {
    const user = userEvent.setup();
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const sheet = screen.getByRole("dialog", { name: "Northwind Labs" });
    expect(
      within(sheet).queryByRole("link", { name: "CV" }),
    ).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("dialog", { name: "Edit Application" }),
    ).toHaveTextContent("Northwind Labs");
  });

  it("deletes behind the confirm sheet, then goes back to the list", async () => {
    const user = userEvent.setup();
    await renderApplication();
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = screen.getByRole("alertdialog");
    mocks.getApplications.mockResolvedValue([]);
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mocks.deleteApplication).toHaveBeenCalledWith("a1"),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pipeline" }),
    ).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("offers the CV copy with cvs", async () => {
    const user = userEvent.setup();
    mocks.features = WITH_CVS;
    await renderApplication({ features: WITH_CVS });
    await screen.findByRole("heading", { level: 1, name: "Northwind Labs" });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("link", { name: "CV" })).toHaveAttribute(
      "href",
      "/applications/cv?id=a1",
    );
  });

  it("is read-only on an archived cycle: no bar, no Edit, no Delete", async () => {
    const user = userEvent.setup();
    mocks.getApplications.mockImplementation((cycleId?: string | null) =>
      Promise.resolve(cycleId === "c2" ? [app()] : []),
    );
    setLocation("/applications");
    await renderApplication({ extra: <PickPastCycle /> });
    await user.click(screen.getByRole("button", { name: "pick past cycle" }));
    await user.click(
      await screen.findByRole("link", { name: "Northwind Labs" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Northwind Labs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Viewing archived cycle")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log update" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reopen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
  });

  it("says the application is not in the cycle being viewed", async () => {
    setLocation("/applications?focus=elsewhere");
    await renderApplication();

    expect(
      await screen.findByText(
        "This application is not in the cycle you are viewing.",
      ),
    ).toBeInTheDocument();
  });
});
