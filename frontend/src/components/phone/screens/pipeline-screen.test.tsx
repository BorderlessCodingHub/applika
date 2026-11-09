import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationsRoute from "@/app/(protected)/applications/page";
import type { Application } from "@/services/types/applications";
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
  listDrafts: vi.fn(),
  quickAdd: vi.fn(),
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
    applications: { getApplications: mocks.getApplications },
    applicationDrafts: { list: mocks.listDrafts },
    cycles: {
      getCycles: () =>
        Promise.resolve([
          { id: "c2", name: "Fall 2026", created_at: "", updated_at: null },
        ]),
    },
    features: { getMine: () => Promise.resolve(mocks.features) },
    platforms: { list: () => Promise.resolve([]) },
    timeline: { list: () => Promise.resolve([]) },
  },
}));

vi.mock("@/components/timeline/timeline-event-form", async () => ({
  TimelineEventForm: (await import("@/test/timeline-dialog-stub"))
    .TimelineEventFormStub,
}));

// The quick add is tested on its own (quick-add-sheet.test.tsx).
vi.mock("@/components/phone/screens/quick-add-sheet", () => ({
  QuickAddSheet: ({ open }: { open: boolean }) => {
    mocks.quickAdd(open);
    return open ? <div role="dialog" aria-label="Add application" /> : null;
  },
}));

// Monday 9 November 2026.
const NOW = new Date(2026, 10, 9, 10, 0);

const step = (name: string, date = "2026-11-05") => ({
  id: `step-${name}`,
  name,
  color: "#000",
  date,
});

function app(id: string, overrides: Partial<Application> = {}): Application {
  return {
    id,
    company_id: null,
    company_name: `Company ${id}`,
    platform_id: "p1",
    role: `Role ${id}`,
    mode: "active",
    application_date: "2026-11-02",
    finalized: false,
    finalized_at: null,
    last_step: null,
    ...overrides,
  };
}

const LIST: Application[] = [
  app("ap1", { company_name: "Acme", application_date: "2026-11-08" }),
  app("ap2", { company_name: "Quiet Ltd", application_date: "2026-10-20" }),
  app("ap3", { application_date: "2026-11-07" }),
  app("ap4", { application_date: "2026-11-06" }),
  app("ap5", { application_date: "2026-11-05" }),
  app("tech", { last_step: step("Phase 2") }),
  app("screen", { last_step: step("Initial Screen") }),
  app("offer", { last_step: step("Offer") }),
  app("denied", { company_name: "Denial Corp", last_step: step("Denied") }),
  app("won", {
    company_name: "Won Inc",
    last_step: step("Offer"),
    finalized: true,
    finalized_at: "2026-11-06T10:00:00Z",
  }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setLocation("/applications");
  currentUser = SAM;
  mocks.getApplications.mockReset().mockResolvedValue(LIST);
  mocks.listDrafts.mockReset().mockResolvedValue([]);
  mocks.quickAdd.mockReset();
  mocks.features = [];
});

afterEach(() => {
  vi.useRealTimers();
});

const renderPipeline = (
  options: Parameters<typeof renderPhoneScreen>[2] = {},
) => renderPhoneScreen("/applications", <ApplicationsRoute />, options);

const group = (name: RegExp) => screen.getByRole("region", { name });

describe("PipelineScreen", () => {
  it("heads the list with the cycle, its count, search and the initials", async () => {
    await renderPipeline();

    expect(
      screen.getByRole("heading", { level: 1, name: "Pipeline" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Current Cycle · 10 applications"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Search applications" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Account" })).toHaveTextContent(
      "SC",
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    // Not the desktop list.
    expect(
      screen.queryByRole("heading", { name: "Applications" }),
    ).not.toBeInTheDocument();
  });

  it("offers All and each stage with its count", async () => {
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    const pills = within(
      screen.getByRole("tablist", { name: "Filter by stage" }),
    ).getAllByRole("tab");
    expect(pills.map((pill) => pill.textContent)).toEqual([
      "All 10",
      "Technical 1",
      "Screening 1",
      "Applied 5",
      "Offer 1",
      "Closed 2",
    ]);
    expect(pills[0]).toHaveAttribute("aria-selected", "true");
  });

  it("groups by stage in the board's order, three per stage and Show N more", async () => {
    const user = userEvent.setup();
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Technical 1",
      "Screening 1",
      "Applied 5",
      "Offer 1",
      "Closed 2",
    ]);
    const applied = group(/^Applied/);
    expect(within(applied).getAllByRole("link")).toHaveLength(3);
    await user.click(
      within(applied).getByRole("button", { name: "Show 2 more" }),
    );
    expect(within(applied).getAllByRole("link")).toHaveLength(5);
  });

  it("names each row by its company and describes role, time and Stale", async () => {
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    // The oldest update is the last of its stage: past "Show N more".
    await userEvent
      .setup()
      .click(
        within(group(/^Applied/)).getByRole("button", { name: "Show 2 more" }),
      );
    const quiet = screen.getByRole("link", { name: "Quiet Ltd" });
    expect(quiet).toHaveAttribute("href", "/applications?focus=ap2");
    expect(quiet).toHaveAttribute("data-stale", "true");
    expect(quiet).toHaveTextContent("2w");
    expect(quiet).toHaveAccessibleDescription("Role ap2 2 weeks ago Stale");
    const fresh = screen.getByRole("link", { name: "Acme" });
    expect(fresh).not.toHaveAttribute("data-stale");
    expect(fresh).toHaveTextContent("1d");
  });

  it("lists an open denial under Closed with Denied, and a closed offer with Offer (PRD 0021 edge case)", async () => {
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    const closed = group(/^Closed/);
    expect(
      within(closed).getByRole("link", { name: "Denial Corp" }),
    ).toHaveTextContent("Denied");
    expect(
      within(closed).getByRole("link", { name: "Won Inc" }),
    ).toHaveTextContent("Offer");
  });

  it("filters by a stage pill", async () => {
    const user = userEvent.setup();
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    await user.click(screen.getByRole("tab", { name: "Offer 1" }));
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Offer 1"]);
  });

  it("searches by company or role, and the closing clears it", async () => {
    const user = userEvent.setup();
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    await user.click(
      screen.getByRole("button", { name: "Search applications" }),
    );
    const search = screen.getByRole("searchbox");
    expect(search).toHaveFocus();
    await user.type(search, "acme");
    expect(screen.getAllByRole("link", { name: /Acme|Company/ })).toHaveLength(
      1,
    );
    expect(screen.getByRole("tab", { name: "All 1" })).toBeInTheDocument();
    // The count is the cycle's, not the search's.
    expect(
      screen.getByText("Current Cycle · 10 applications"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Search applications" }),
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All 10" })).toBeInTheDocument();
  });

  it("opens a row's Application screen in place, and Pipeline brings the list back", async () => {
    const user = userEvent.setup();
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    await user.click(screen.getByRole("link", { name: "Acme" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Acme" }),
    ).toBeInTheDocument();
    expect(window.location.search).toBe("?focus=ap1");
    // No tab bar and no Add on the Application screen.
    expect(document.querySelector('[data-slot="phone-tab-bar"]')).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveFocus();

    await user.click(screen.getByRole("link", { name: "Pipeline" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Pipeline" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acme" })).toHaveFocus();
  });

  it("moves a row to its new stage once Log update saved an event", async () => {
    const user = userEvent.setup();
    // The app's 5-minute stale time: a remount alone refetches nothing.
    await renderPipeline({
      client: new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } },
      }),
    });
    await screen.findByText("Current Cycle · 10 applications");
    await user.click(
      within(group(/^Applied/)).getByRole("button", { name: "Show 2 more" }),
    );
    await user.click(screen.getByRole("link", { name: "Quiet Ltd" }));
    await screen.findByRole("heading", { level: 1, name: "Quiet Ltd" });

    await user.click(screen.getByRole("button", { name: "Log update" }));
    mocks.getApplications.mockResolvedValue(
      LIST.map((item) =>
        item.id === "ap2"
          ? { ...item, last_step: step("Initial Screen", "2026-11-09") }
          : item,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("link", { name: "Pipeline" }));

    const screening = await screen.findByRole("region", {
      name: /^Screening 2/,
    });
    const row = within(screening).getByRole("link", { name: "Quiet Ltd" });
    expect(row).not.toHaveAttribute("data-stale");
    expect(row).toHaveTextContent("0d");
  });

  it("follows the back gesture from the Application screen to the list", async () => {
    const user = userEvent.setup();
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");
    await user.click(screen.getByRole("link", { name: "Acme" }));
    await screen.findByRole("heading", { level: 1, name: "Acme" });

    window.history.back();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Pipeline" }),
    ).toBeInTheDocument();
  });

  it("shows an archived cycle read-only: its name, the note, no Add (PRD 0021 edge case)", async () => {
    const user = userEvent.setup();
    await renderPipeline({ extra: <PickPastCycle /> });
    await screen.findByText("Current Cycle · 10 applications");

    await user.click(screen.getByRole("button", { name: "pick past cycle" }));

    expect(
      await screen.findByText("Fall 2026 · 10 applications"),
    ).toBeInTheDocument();
    expect(mocks.getApplications).toHaveBeenCalledWith("c2");
    expect(screen.getByText("Viewing archived cycle")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
  });

  it("says today's empty words, with the quick add, when there is no application (PRD 0021 edge case)", async () => {
    const user = userEvent.setup();
    mocks.getApplications.mockResolvedValue([]);
    await renderPipeline();

    expect(
      await screen.findByText("No applications found"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Current Cycle · 0 applications"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Create your first application" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Add application" }),
    ).toBeInTheDocument();
  });

  it("adds a Drafts pill with cvs on the current cycle, resuming each draft", async () => {
    const user = userEvent.setup();
    mocks.listDrafts.mockResolvedValue([
      {
        id: "d1",
        company_name: "Draft Co",
        role: "Draft role",
        platform_id: "p1",
        has_cv: true,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: null,
      },
    ]);
    mocks.features = WITH_CVS;
    await renderPipeline({ features: WITH_CVS });

    const drafts = await screen.findByRole("tab", { name: "Drafts 1" });
    await user.click(drafts);
    expect(screen.getByRole("link", { name: "Draft Co" })).toHaveAttribute(
      "href",
      "/applications/new-with-cv?id=d1",
    );
  });

  it("shows no Drafts pill without cvs, and asks for no draft", async () => {
    await renderPipeline();
    await screen.findByText("Current Cycle · 10 applications");

    expect(
      screen.queryByRole("tab", { name: /Drafts/ }),
    ).not.toBeInTheDocument();
    expect(mocks.listDrafts).not.toHaveBeenCalled();
  });

  it("truncates a long company or role (PRD 0021 edge case)", async () => {
    mocks.getApplications.mockResolvedValue([
      app("long", {
        company_name: "An Extraordinarily Long Company Name Incorporated",
        role: "Principal Staff Senior Lead Engineer of Everything",
      }),
    ]);
    await renderPipeline();

    expect(
      await screen.findByText(
        "An Extraordinarily Long Company Name Incorporated",
      ),
    ).toHaveClass("ph-pipe-company");
    expect(
      screen.getByText("Principal Staff Senior Lead Engineer of Everything"),
    ).toHaveClass("ph-pipe-role");
  });

  it("says what failed and retries", async () => {
    const user = userEvent.setup();
    mocks.getApplications.mockRejectedValueOnce(new Error("down"));
    await renderPipeline();

    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Current Cycle · 10 applications"),
    ).toBeInTheDocument();
  });
});
