import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobsPage } from "@/app/(protected)/jobs/jobs-page";
import {
  apiError,
  makeCv,
  makeJob,
  makePage,
} from "@/components/jobs/job-test-fixtures";
import type { BaseCv } from "@/services/types/base-cv";
import type { MyFeature } from "@/services/types/features";
import type { JobFilters } from "@/services/types/jobs";
import { pathname, setLocation } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

/**
 * `/jobs` below md: v2/Jobs on today's hooks, inside today's `jobs` gate.
 * Services are mocked; the URL is real jsdom history.
 */

const mocks = vi.hoisted(() => ({
  features: { current: [] as MyFeature[] },
  listJobs: vi.fn(),
  dismissJob: vi.fn(),
  restoreJob: vi.fn(),
  listBaseCvs: vi.fn(),
  listSearches: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.toastError, info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: () => Promise.resolve(mocks.features.current) },
    jobs: {
      list: (...args: unknown[]) => mocks.listJobs(...args),
      dismiss: (...args: unknown[]) => mocks.dismissJob(...args),
      restore: (...args: unknown[]) => mocks.restoreJob(...args),
    },
    baseCvs: { list: (...args: unknown[]) => mocks.listBaseCvs(...args) },
    jobSearches: {
      list: (...args: unknown[]) => mocks.listSearches(...args),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

const JOBS: MyFeature[] = [{ key: "jobs", stage: "beta" }];
const JOBS_AND_CVS: MyFeature[] = [...JOBS, { key: "cvs", stage: "beta" }];
const ONE_CV: BaseCv[] = [makeCv("7", "Backend CV")];

const TOP = makeJob({
  id: "101",
  title: "Senior Backend Engineer",
  tags: ["python", "django", "postgres", "aws", "docker", "redis", "kafka"],
});
const DRAFTED = makeJob({
  id: "102",
  title: "Platform Engineer",
  company_name: "Globex",
  best_fit: { base_cv_id: "7", score: 55 },
  application: { id: "d1", is_draft: true },
});
const APPLIED = makeJob({
  id: "103",
  title: "Data Engineer",
  company_name: "Initech",
  best_fit: { base_cv_id: "7", score: 20 },
  application: { id: "a1", is_draft: false },
});

const lastFilters = () =>
  (mocks.listJobs.mock.calls.at(-1) as [JobFilters, number])[0];

beforeEach(() => {
  mocks.features.current = JOBS_AND_CVS;
  mocks.listJobs
    .mockReset()
    .mockResolvedValue(makePage([TOP, DRAFTED, APPLIED]));
  mocks.dismissJob.mockReset().mockResolvedValue(undefined);
  mocks.restoreJob.mockReset().mockResolvedValue(undefined);
  mocks.listBaseCvs.mockReset().mockResolvedValue(ONE_CV);
  mocks.listSearches.mockReset().mockResolvedValue([]);
  mocks.toastError.mockReset();
  pathname.current = "/jobs";
  setLocation("/jobs");
});

const renderJobs = (features: MyFeature[] = JOBS_AND_CVS) => {
  mocks.features.current = features;
  return renderPhoneScreen("/jobs", <JobsPage />, { features });
};

const cardOf = (title: string) =>
  screen.getByRole("article", { name: title }) as HTMLElement;

describe("Jobs below md", () => {
  it("renders the Jobs board: back to Account, Beta, search, chips and one article per job", async () => {
    await renderJobs();

    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(within(bar).getByText("Beta")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Jobs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Remote jobs from Himalayas and RemoteOK, matched against your master CVs.",
      ),
    ).toHaveClass("ph-lead");

    const search = screen.getByRole("search", { name: "Filter jobs" });
    const input = within(search).getByRole("searchbox", {
      name: "Search jobs",
    });
    expect(input).toHaveClass("ph-input", "ph-jb-search-input");
    expect(input).toHaveAttribute("placeholder", "Search jobs");

    const toolbar = screen.getByRole("toolbar", { name: "Sort and filters" });
    expect(
      within(toolbar).getByRole("button", { name: "Best fit" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(toolbar).getByRole("button", { name: "Newest" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(toolbar).getByRole("button", { name: "All sources" }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    expect(
      within(toolbar).getByRole("button", { name: "More filters" }),
    ).toHaveAttribute("aria-haspopup", "dialog");

    const top = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    expect(top).toHaveClass("ph-card", "ph-jb-card");
    const link = within(top).getByRole("link", {
      name: "Senior Backend Engineer",
    });
    expect(link).toHaveAttribute("href", "/jobs/view?id=101");
    expect(link).toHaveAccessibleDescription("Acme Remote · Himalayas Fit 72%");
    const fit = top.querySelector('[data-slot="fit-badge"]')!;
    expect(fit).toHaveTextContent("Fit 72%");
    expect(fit).toHaveAttribute("data-band", "strong");
    expect(fit).toHaveClass("ph-fit", "ph-strong");
    // Six tags, then "+1 more" (today's list item).
    expect(
      within(top).getAllByText(/^(python|django|postgres|aws|docker|redis)$/),
    ).toHaveLength(6);
    expect(within(top).getByText("+1 more")).toBeInTheDocument();
    expect(top.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-09T12:00:00Z",
    );
    const dismiss = within(top).getByRole("button", { name: "Dismiss" });
    expect(dismiss).toHaveClass("ph-jb-dismiss");
    expect(dismiss).toHaveAccessibleDescription("Senior Backend Engineer");

    // A drafted or applied job shows its mark instead of Dismiss (the board).
    const drafted = cardOf("Platform Engineer");
    expect(
      within(drafted).queryByRole("button", { name: "Dismiss" }),
    ).toBeNull();
    expect(
      within(drafted).getByRole("link", { name: "Draft" }),
    ).toHaveAttribute("href", "/applications/new-with-cv?id=d1");
    expect(drafted.querySelector('[data-slot="fit-badge"]')).toHaveAttribute(
      "data-band",
      "partial",
    );
    const applied = cardOf("Data Engineer");
    expect(
      within(applied).getByRole("link", { name: "Applied" }),
    ).toHaveAttribute("href", "/applications?focus=a1");
    expect(applied.querySelector('[data-slot="fit-badge"]')).toHaveAttribute(
      "data-band",
      "low",
    );

    // Start application lives on the job page, not on the cards.
    expect(
      screen.queryByRole("button", { name: "Start application" }),
    ).toBeNull();
    expect(screen.getByText("New jobs arrive every hour.")).toHaveClass(
      "ph-jb-note",
    );
    // The shell adds no padding: the board owns it.
    expect(
      document.querySelector('[data-slot="app-content"]')!.className,
    ).not.toContain("px-4");
  });

  it("without cvs: no fit, no Best fit, no CV request, and Draft is plain text", async () => {
    await renderJobs(JOBS);

    expect(
      await screen.findByRole("article", { name: "Platform Engineer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Remote jobs from Himalayas and RemoteOK."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Best fit" })).toBeNull();
    expect(document.querySelector('[data-slot="fit-badge"]')).toBeNull();
    const drafted = cardOf("Platform Engineer");
    expect(within(drafted).queryByRole("link", { name: "Draft" })).toBeNull();
    expect(
      drafted.querySelector('[data-slot="job-status-badge"]'),
    ).toHaveTextContent("Draft");
    expect(
      within(cardOf("Data Engineer")).getByRole("link", { name: "Applied" }),
    ).toBeInTheDocument();
    expect(mocks.listBaseCvs).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Start application" }),
    ).toBeNull();
  });

  it("without jobs: page not found and not one job request", async () => {
    await renderJobs([{ key: "cvs", stage: "beta" }]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-slot="phone-jobs"]')).toBeNull();
    expect(mocks.listJobs).not.toHaveBeenCalled();
    expect(mocks.listSearches).not.toHaveBeenCalled();
  });

  it("shows the master CV invitation and no fit while a cvs user has no master CV", async () => {
    mocks.listBaseCvs.mockResolvedValue([]);
    await renderJobs();

    expect(
      await screen.findByRole("link", {
        name: /Create a master CV to see how well you fit each job/,
      }),
    ).toBeInTheDocument();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    expect(document.querySelector('[data-slot="fit-badge"]')).toBeNull();
  });

  it("loads with the board's skeleton, then fails with a Retry that refetches", async () => {
    const user = userEvent.setup();
    mocks.listJobs.mockRejectedValueOnce(apiError(500, "Jobs are down"));
    await renderJobs();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading jobs");
    expect(await screen.findByText("Jobs are down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("article", { name: "Senior Backend Engineer" }),
    ).toBeInTheDocument();
  });

  it("says when there are no jobs yet, and offers to clear filters when none match", async () => {
    const user = userEvent.setup();
    mocks.listJobs.mockResolvedValue(makePage([]));
    const { unmount } = await renderJobs();

    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    unmount();

    setLocation("/jobs?source=remoteok&search=rust");
    await renderJobs();
    expect(
      await screen.findByText("No jobs match these filters"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("writes the sort, the search and the source to the URL", async () => {
    const user = userEvent.setup();
    await renderJobs();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    await user.click(screen.getByRole("button", { name: "Best fit" }));
    await waitFor(() => expect(window.location.search).toBe("?sort=fit"));
    expect(screen.getByRole("button", { name: "Best fit" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(lastFilters().sort).toBe("fit"));

    await user.type(
      screen.getByRole("searchbox", { name: "Search jobs" }),
      "python{Enter}",
    );
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("search")).toBe(
        "python",
      ),
    );

    await user.click(screen.getByRole("button", { name: "All sources" }));
    const sheet = screen.getByRole("dialog", { name: "Source" });
    const options = within(sheet).getAllByRole("button", {
      name: /All sources|Himalayas|RemoteOK/,
    });
    expect(options.map((option) => option.textContent)).toEqual([
      "All sources",
      "Himalayas",
      "RemoteOK",
    ]);
    expect(options[0]).toHaveAttribute("aria-current", "true");
    await user.click(within(sheet).getByRole("button", { name: "RemoteOK" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Source" })).toBeNull(),
    );
    expect(new URLSearchParams(window.location.search).get("source")).toBe(
      "remoteok",
    );
    expect(screen.getByRole("button", { name: "RemoteOK" })).toHaveClass(
      "ph-on",
    );
  });

  it("holds the other filters and today's saved searches in the More filters sheet", async () => {
    const user = userEvent.setup();
    await renderJobs();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    const trigger = screen.getByRole("button", { name: "More filters" });
    await user.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "More filters" });
    expect(within(sheet).getByRole("textbox", { name: "Tags" })).toBeVisible();
    expect(
      within(sheet).getByRole("group", { name: "Minimum fit" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("group", { name: "Published within" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Saved searches" }),
    ).toBeInTheDocument();

    await user.click(
      within(sheet).getByRole("switch", { name: "Show dismissed" }),
    );
    await waitFor(() =>
      expect(
        new URLSearchParams(window.location.search).get("include_dismissed"),
      ).toBe("true"),
    );
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "More filters" })).toBeNull(),
    );
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveClass("ph-on");
  });

  it("locks Minimum fit with its reason while a cvs user has no master CV", async () => {
    const user = userEvent.setup();
    mocks.listBaseCvs.mockResolvedValue([]);
    await renderJobs();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    await user.click(screen.getByRole("button", { name: "More filters" }));
    const group = screen.getByRole("group", { name: "Minimum fit" });
    expect(group).toHaveAccessibleDescription("Needs a master CV.");
    expect(
      within(group).getByRole("button", { name: "Any fit" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("pages with Show more on the same key, without writing ?page=", async () => {
    const user = userEvent.setup();
    const second = makeJob({ id: "201", title: "Site Reliability Engineer" });
    mocks.listJobs.mockImplementation(
      async (_filters: JobFilters, page: number) =>
        page === 1
          ? makePage([TOP], { total: 2, total_pages: 2 })
          : makePage([second], { page: 2, total: 2, total_pages: 2 }),
    );
    await renderJobs();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(
      await screen.findByRole("article", { name: "Site Reliability Engineer" }),
    ).toBeInTheDocument();
    expect(mocks.listJobs).toHaveBeenCalledWith(expect.anything(), 2);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("keeps the loaded pages when the next one fails, and a tap on Show more retries it", async () => {
    const user = userEvent.setup();
    const second = makeJob({ id: "201", title: "Site Reliability Engineer" });
    let failSecond = true;
    mocks.listJobs.mockImplementation(
      async (_filters: JobFilters, page: number) => {
        if (page === 1) return makePage([TOP], { total: 2, total_pages: 2 });
        if (failSecond) throw apiError(500, "Page two is down");
        return makePage([second], { page: 2, total: 2, total_pages: 2 });
      },
    );
    await renderJobs();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    await user.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Page two is down"),
    );
    expect(
      screen.getByRole("article", { name: "Senior Backend Engineer" }),
    ).toBeInTheDocument();
    failSecond = false;
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(
      await screen.findByRole("article", { name: "Site Reliability Engineer" }),
    ).toBeInTheDocument();
  });

  it("dismisses optimistically, counts it in the board's note and puts focus on the h1", async () => {
    const user = userEvent.setup();
    const dismissed = new Set<string>();
    mocks.dismissJob.mockImplementation(async (id: string) => {
      dismissed.add(id);
    });
    mocks.listJobs.mockImplementation(async () =>
      makePage([TOP, DRAFTED, APPLIED].filter((job) => !dismissed.has(job.id))),
    );
    await renderJobs();
    const top = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });

    await user.click(within(top).getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("article", { name: "Senior Backend Engineer" }),
      ).toBeNull(),
    );
    expect(mocks.dismissJob).toHaveBeenCalledWith("101");
    expect(
      screen.getByText("1 dismissed · Show dismissed in More filters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Jobs" }),
    ).toHaveFocus();
  });

  it("takes a failed dismiss back out of the board's note", async () => {
    const user = userEvent.setup();
    mocks.dismissJob.mockRejectedValue(apiError(500, "Could not dismiss"));
    await renderJobs();
    const top = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });

    await user.click(within(top).getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Could not dismiss"),
    );
    expect(
      await screen.findByRole("article", { name: "Senior Backend Engineer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("New jobs arrive every hour.")).toBeInTheDocument();
    expect(screen.queryByText(/dismissed · Show dismissed/)).toBeNull();
  });

  it("restores a dismissed job shown with Show dismissed", async () => {
    const user = userEvent.setup();
    setLocation("/jobs?include_dismissed=true");
    mocks.listJobs.mockResolvedValue(
      makePage([makeJob({ id: "101", dismissed: true })]),
    );
    await renderJobs();
    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    expect(card).toHaveAttribute("data-dismissed");
    expect(within(card).getByText("Dismissed")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Restore" }));
    expect(mocks.restoreJob).toHaveBeenCalledWith("101");
  });

  it("swaps to today's board at md, inside the same gate", async () => {
    mocks.features.current = JOBS_AND_CVS;
    const { viewport } = renderPhonePage(<JobsPage />, {
      features: JOBS_AND_CVS,
    });
    expect(
      await screen.findByRole("article", { name: "Senior Backend Engineer" }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-slot="phone-jobs"]')).not.toBeNull();

    viewport.setPhone(false);
    expect(document.querySelector('[data-slot="phone-jobs"]')).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Saved searches" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Start application" }).length,
    ).toBeGreaterThan(0);
  });
});
