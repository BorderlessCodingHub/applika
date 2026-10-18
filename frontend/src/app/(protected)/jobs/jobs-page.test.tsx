import { useMemo, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import type { MyFeature } from "@/services/types/features";
import { JobsPage } from "./jobs-page";
import {
  apiError,
  makeCv,
  makeDetail,
  makeJob,
  makePage,
} from "@/components/jobs/job-test-fixtures";
import { localCalendarDay } from "@/components/application-drafts/draft-copy";
import type { BaseCv } from "@/services/types/base-cv";
import type { JobSearch } from "@/services/types/job-searches";
import {
  DEFAULT_JOB_FILTERS,
  type JobFilters,
  type JobPage,
} from "@/services/types/jobs";

/**
 * `/jobs` (T081, T086, T087 wiring): AC2, AC3, AC5, AC7 (the success signal),
 * AC10, AC12. Services are mocked; the URL is real jsdom history, and
 * `useSearchParams` follows it the way Next does for `history.pushState`.
 */

const listJobs = vi.fn();
const getJob = vi.fn();
const dismissJob = vi.fn();
const restoreJob = vi.fn();
const listBaseCvs = vi.fn();
const listSearches = vi.fn();
const createSearch = vi.fn();
const updateSearch = vi.fn();
const removeSearch = vi.fn();
const createFromJob = vi.fn();
const push = vi.fn();

/**
 * The cases written before PRD 0013 run with `jobs` in beta, and with `cvs`
 * too: fit, Start and the invitation need both.
 */
const JOBS_AND_CVS: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "beta" },
];
let myFeatures: MyFeature[] = JOBS_AND_CVS;
const getMyFeatures = vi.fn();
let seedFeatures = true;

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: (...args: unknown[]) => getMyFeatures(...args) },
    jobs: {
      list: (...args: unknown[]) => listJobs(...args),
      get: (...args: unknown[]) => getJob(...args),
      dismiss: (...args: unknown[]) => dismissJob(...args),
      restore: (...args: unknown[]) => restoreJob(...args),
    },
    baseCvs: { list: (...args: unknown[]) => listBaseCvs(...args) },
    jobSearches: {
      list: (...args: unknown[]) => listSearches(...args),
      create: (...args: unknown[]) => createSearch(...args),
      update: (...args: unknown[]) => updateSearch(...args),
      remove: (...args: unknown[]) => removeSearch(...args),
    },
    applicationDrafts: {
      createFromJob: (...args: unknown[]) => createFromJob(...args),
    },
  },
}));

const urlListeners = new Set<() => void>();
function subscribeUrl(listener: () => void) {
  urlListeners.add(listener);
  return () => urlListeners.delete(listener);
}
function useTestSearchParams() {
  const search = useSyncExternalStore(
    subscribeUrl,
    () => window.location.search,
  );
  return useMemo(() => new URLSearchParams(search), [search]);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => useTestSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const originalPush = window.history.pushState.bind(window.history);
const originalReplace = window.history.replaceState.bind(window.history);
let pushSpy: ReturnType<typeof vi.fn>;
let replaceSpy: ReturnType<typeof vi.fn>;

function notifyUrl() {
  for (const listener of urlListeners) listener();
}

function setUrl(query: string) {
  originalReplace(null, "", `/jobs${query ? `?${query}` : ""}`);
  notifyUrl();
}

const currentQuery = () => window.location.search.replace(/^\?/, "");

const ONE_CV: BaseCv[] = [makeCv("7", "Backend CV")];

function lastListCall(): [JobFilters, number] {
  return listJobs.mock.calls.at(-1) as [JobFilters, number];
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seeded, as after the shell's own fetch: the gate opens on the first frame.
  if (seedFeatures) client.setQueryData(MY_FEATURES_QUERY_KEY, myFeatures);
  return render(
    <QueryClientProvider client={client}>
      <JobsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  myFeatures = JOBS_AND_CVS;
  seedFeatures = true;
  getMyFeatures.mockReset().mockImplementation(async () => myFeatures);
  setUrl("");
  pushSpy = vi.fn((...args: Parameters<History["pushState"]>) => {
    originalPush(...args);
    notifyUrl();
  });
  replaceSpy = vi.fn((...args: Parameters<History["replaceState"]>) => {
    originalReplace(...args);
    notifyUrl();
  });
  window.history.pushState = pushSpy;
  window.history.replaceState = replaceSpy;
  // jsdom has no element scrolling; `scrollIntoContainer` calls it on <main>.
  Element.prototype.scrollTo = vi.fn() as unknown as Element["scrollTo"];
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };

  listJobs.mockReset().mockResolvedValue(makePage([makeJob()]));
  getJob.mockReset().mockResolvedValue(makeDetail());
  dismissJob.mockReset().mockResolvedValue(undefined);
  restoreJob.mockReset().mockResolvedValue(undefined);
  listBaseCvs.mockReset().mockResolvedValue(ONE_CV);
  listSearches.mockReset().mockResolvedValue([]);
  createSearch.mockReset().mockResolvedValue({});
  updateSearch.mockReset().mockResolvedValue({});
  removeSearch.mockReset().mockResolvedValue(undefined);
  createFromJob.mockReset().mockResolvedValue({ id: "555" });
  push.mockReset();
});

afterEach(() => {
  window.history.pushState = originalPush;
  window.history.replaceState = originalReplace;
});

describe("/jobs: the list (AC2)", () => {
  it("lists jobs newest first, 25 per page, with every field and the best fit", async () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Jobs" }),
    ).toBeInTheDocument();

    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    expect(lastListCall()).toEqual([DEFAULT_JOB_FILTERS, 1]);
    for (const text of [
      "Acme Remote",
      "Himalayas",
      "Worldwide",
      "Full time",
      "$120k - $150k",
      "python",
      "Fit 72%",
    ]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(card.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-09T12:00:00Z",
    );
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("1 job");
  });

  it("shows a loading state, then the count", async () => {
    let resolve: (page: JobPage) => void = () => {};
    listJobs.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    expect(screen.getByText("Loading jobs")).toBeInTheDocument();
    resolve(makePage([makeJob()], { total: 142, total_pages: 6 }));
    expect(await screen.findByText("142 jobs")).toBeInTheDocument();
  });

  it("says no jobs yet when nothing is listed and no filter is set", async () => {
    listJobs.mockResolvedValue(makePage([]));
    renderPage();
    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
    expect(screen.getByText("New jobs arrive every hour.")).toBeInTheDocument();
  });

  it("says nothing matches when filters leave no job, and clears them", async () => {
    setUrl("tags=cobol&sort=fit");
    listJobs.mockResolvedValue(makePage([]));
    renderPage();
    expect(
      await screen.findByText("No jobs match these filters"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    // Sort is a view, not a filter: it survives the clear.
    expect(currentQuery()).toBe("sort=fit");
  });

  it("shows a load error in role=alert with the API's words", async () => {
    listJobs.mockRejectedValue(apiError(500, "Database is down"));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load jobs");
    expect(alert).toHaveTextContent("Database is down");
  });
});

describe("/jobs: filters live in the URL (AC3, Plan corrections 17)", () => {
  it("reads every filter and the page from the URL", async () => {
    setUrl(
      "search=django&source=remoteok&tags=python&tags=api&min_fit=60&posted_within_days=7&sort=fit&page=2",
    );
    listJobs.mockResolvedValue(
      makePage([makeJob()], { total: 30, page: 2, total_pages: 2 }),
    );
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    expect(lastListCall()).toEqual([
      {
        search: "django",
        source: "remoteok",
        tags: ["python", "api"],
        min_fit: 60,
        posted_within_days: 7,
        sort: "fit",
        include_dismissed: false,
      },
      2,
    ]);
    expect(screen.getByRole("searchbox", { name: "Search jobs" })).toHaveValue(
      "django",
    );
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("writes a search to the URL with pushState and refetches page 1", async () => {
    setUrl("page=3");
    listJobs.mockResolvedValue(
      makePage([makeJob()], { total: 75, page: 3, total_pages: 3 }),
    );
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    // The next page never lands, so the old one stays as placeholder.
    listJobs.mockReturnValue(new Promise(() => {}));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search jobs" }),
      "rust{Enter}",
    );

    expect(pushSpy).toHaveBeenCalled();
    expect(currentQuery()).toBe("search=rust");
    // The old page stays, marked busy, until the new one lands.
    expect(screen.getByRole("list", { busy: true })).toBeInTheDocument();
    await waitFor(() =>
      expect(lastListCall()).toEqual([
        { ...DEFAULT_JOB_FILTERS, search: "rust" },
        1,
      ]),
    );
  });

  it("filters by source, minimum fit and publication window, and sorts by best fit", async () => {
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    await userEvent.click(screen.getByRole("combobox", { name: "Source" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "RemoteOK" }),
    );
    expect(currentQuery()).toBe("source=remoteok");

    await userEvent.click(screen.getByRole("combobox", { name: "Sort" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Best fit" }),
    );
    expect(currentQuery()).toBe("source=remoteok&sort=fit");

    await userEvent.click(screen.getByRole("button", { name: /More filters/ }));
    await userEvent.click(
      screen.getByRole("combobox", { name: "Minimum fit" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "60% or more" }),
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: "Published within" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "7 days" }),
    );

    expect(currentQuery()).toBe(
      "source=remoteok&min_fit=60&posted_within_days=7&sort=fit",
    );
    await waitFor(() =>
      expect(lastListCall()).toEqual([
        {
          ...DEFAULT_JOB_FILTERS,
          source: "remoteok",
          min_fit: 60,
          posted_within_days: 7,
          sort: "fit",
        },
        1,
      ]),
    );
  });

  it("adds tags as repeated URL keys", async () => {
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    await userEvent.click(screen.getByRole("button", { name: /More filters/ }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Tags" }),
      "python, Django{Enter}",
    );
    expect(currentQuery()).toBe("tags=python&tags=Django");
    await waitFor(() =>
      expect(lastListCall()[0].tags).toEqual(["python", "Django"]),
    );
  });

  it("pages forward and back through the URL", async () => {
    listJobs.mockImplementation((_f: JobFilters, page: number) =>
      Promise.resolve(
        makePage([makeJob({ id: `p${page}`, title: `Job on page ${page}` })], {
          total: 60,
          page,
          total_pages: 3,
        }),
      ),
    );
    renderPage();
    await screen.findByRole("article", { name: "Job on page 1" });
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(currentQuery()).toBe("page=2");
    expect(
      await screen.findByRole("article", { name: "Job on page 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("60 jobs")).toHaveFocus();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    expect(currentQuery()).toBe("");
  });

  it("replaces an out-of-range page with the last one", async () => {
    setUrl("page=9");
    listJobs.mockImplementation((_f: JobFilters, page: number) =>
      Promise.resolve(
        makePage(page > 2 ? [] : [makeJob()], {
          total: 30,
          page,
          total_pages: 2,
        }),
      ),
    );
    renderPage();
    await waitFor(() => expect(currentQuery()).toBe("page=2"));
    expect(replaceSpy).toHaveBeenCalled();
  });
});

describe("/jobs: no master CV (AC5)", () => {
  it("invites the user to create one and shows no fit anywhere", async () => {
    listBaseCvs.mockResolvedValue([]);
    renderPage();
    const invitation = await screen.findByRole("link", {
      name: "Create a master CV to see how well you fit each job",
    });
    expect(invitation).toHaveAttribute("href", "/cvs/new");
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    expect(screen.queryByText(/^Fit \d+%$/)).toBeNull();
  });

  it("disables Minimum fit without a master CV", async () => {
    listBaseCvs.mockResolvedValue([]);
    renderPage();
    await screen.findByRole("link", {
      name: "Create a master CV to see how well you fit each job",
    });
    await userEvent.click(screen.getByRole("button", { name: /More filters/ }));
    expect(
      screen.getByRole("combobox", { name: "Minimum fit" }),
    ).toBeDisabled();
    expect(screen.getByText("Needs a master CV.")).toBeInTheDocument();
  });

  it("does not invite a user who has one", async () => {
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    await waitFor(() => expect(listBaseCvs).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", {
        name: "Create a master CV to see how well you fit each job",
      }),
    ).toBeNull();
  });
});

describe("/jobs: dismiss and restore (AC10)", () => {
  it("drops a dismissed job at once, then lists it with Restore under Show dismissed", async () => {
    const job = makeJob();
    let dismissed = false;
    listJobs.mockImplementation((filters: JobFilters) =>
      Promise.resolve(
        makePage(
          dismissed && !filters.include_dismissed
            ? []
            : [{ ...job, dismissed }],
        ),
      ),
    );
    dismissJob.mockImplementation(() => {
      dismissed = true;
      return Promise.resolve();
    });
    restoreJob.mockImplementation(() => {
      dismissed = false;
      return Promise.resolve();
    });
    renderPage();
    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });

    await userEvent.click(
      within(card).getByRole("button", { name: "Dismiss" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("article", { name: "Senior Backend Engineer" }),
      ).toBeNull(),
    );
    expect(dismissJob).toHaveBeenCalledWith("101");

    await userEvent.click(
      screen.getByRole("switch", { name: "Show dismissed" }),
    );
    expect(currentQuery()).toBe("include_dismissed=true");
    const back = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    expect(within(back).getByText("Dismissed")).toBeInTheDocument();

    await userEvent.click(
      within(back).getByRole("button", { name: "Restore" }),
    );
    expect(restoreJob).toHaveBeenCalledWith("101");
    await waitFor(() =>
      expect(
        within(back).getByRole("button", { name: "Dismiss" }),
      ).toBeVisible(),
    );
  });
});

describe("/jobs: the success signal (AC7)", () => {
  /**
   * The owner: "After picking a master CV, a user goes from a listed job to a
   * draft holding a CV copy tailored by keywords in three clicks or fewer."
   * Every click the user makes goes through `click`, so the count is real.
   */
  it("goes from a listed job to a keyword-tailored draft in three clicks", async () => {
    const user = userEvent.setup();
    let clicks = 0;
    const click = async (element: Element) => {
      clicks += 1;
      await user.click(element);
    };
    renderPage();
    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });

    await click(
      within(card).getByRole("button", { name: "Start application" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Start an application",
    });
    // The lone master CV is already picked: "after picking a master CV".
    await waitFor(() =>
      expect(
        within(dialog).getByRole("radio", { name: "Backend CV" }),
      ).toBeChecked(),
    );
    await click(
      await within(dialog).findByRole("radio", { name: "Tailor by keywords" }),
    );
    await click(within(dialog).getByRole("button", { name: "Create draft" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/applications/new-with-cv?id=555&step=cv",
      ),
    );
    expect(createFromJob).toHaveBeenCalledWith({
      job_id: "101",
      base_cv_id: "7",
      tailoring: "keywords",
      application_date: localCalendarDay(),
    });
    expect(clicks).toBe(3);
  });

  it("keeps three counted clicks when the user picks one of several CVs", async () => {
    listBaseCvs.mockResolvedValue([
      makeCv("7", "Backend CV"),
      makeCv("8", "Data CV"),
    ]);
    const user = userEvent.setup();
    let clicks = 0;
    const click = async (element: Element) => {
      clicks += 1;
      await user.click(element);
    };
    renderPage();
    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    await click(
      within(card).getByRole("button", { name: "Start application" }),
    );
    const dialog = await screen.findByRole("dialog");
    // Picking the CV is not counted (the owner's "after picking a master CV").
    await user.click(
      await within(dialog).findByRole("radio", { name: "Data CV" }),
    );
    await click(
      await within(dialog).findByRole("radio", { name: "Tailor by keywords" }),
    );
    await click(within(dialog).getByRole("button", { name: "Create draft" }));

    await waitFor(() =>
      expect(createFromJob).toHaveBeenCalledWith({
        job_id: "101",
        base_cv_id: "8",
        tailoring: "keywords",
        application_date: localCalendarDay(),
      }),
    );
    expect(push).toHaveBeenCalledWith(
      "/applications/new-with-cv?id=555&step=cv",
    );
    expect(clicks).toBe(3);
  });

  it("starting again on a job with a draft offers to open it (AC8)", async () => {
    listJobs.mockResolvedValue(
      makePage([makeJob({ application: { id: "900", is_draft: true } })]),
    );
    getJob.mockResolvedValue(
      makeDetail({ application: { id: "900", is_draft: true } }),
    );
    createFromJob.mockRejectedValue(
      apiError(409, "You already have an application for this job"),
    );
    renderPage();
    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    expect(within(card).getByRole("link", { name: "Draft" })).toHaveAttribute(
      "href",
      "/applications/new-with-cv?id=900",
    );
    await userEvent.click(
      within(card).getByRole("button", { name: "Start application" }),
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("radio", { name: "Backend CV" }),
      ).toBeChecked(),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create draft" }),
    );
    expect(
      await within(dialog).findByRole("link", { name: "Open draft" }),
    ).toHaveAttribute("href", "/applications/new-with-cv?id=900");
  });
});

describe("/jobs: saved searches (AC12)", () => {
  const SAVED: JobSearch = {
    id: "1",
    name: "Python, best fit",
    filters: {
      ...DEFAULT_JOB_FILTERS,
      tags: ["python"],
      sort: "fit",
    },
    created_at: "2026-10-01T00:00:00Z",
    updated_at: null,
  };

  it("applies a saved search: its filters and sort go to the URL, defaults omitted", async () => {
    listSearches.mockResolvedValue([SAVED]);
    setUrl("search=old&page=3");
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    await userEvent.click(
      screen.getByRole("button", { name: "Saved searches" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Python, best fit" }),
    );

    expect(currentQuery()).toBe("tags=python&sort=fit");
    await waitFor(() => expect(lastListCall()).toEqual([SAVED.filters, 1]));
  });

  it("saves the current filters (only JobFilters keys, never page)", async () => {
    setUrl("tags=rust&min_fit=50&page=2");
    listJobs.mockResolvedValue(
      makePage([makeJob()], { total: 30, page: 2, total_pages: 2 }),
    );
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    await userEvent.click(
      screen.getByRole("button", { name: "Saved searches" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save current search" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rust");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save search" }),
    );

    await waitFor(() =>
      expect(createSearch).toHaveBeenCalledWith({
        name: "Rust",
        filters: { ...DEFAULT_JOB_FILTERS, tags: ["rust"], min_fit: 50 },
      }),
    );
  });

  it("shows the server's 409 inline in the dialog", async () => {
    createSearch.mockRejectedValue(
      apiError(409, "Saved search limit reached (max 10)"),
    );
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    await userEvent.click(
      screen.getByRole("button", { name: "Saved searches" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save current search" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Eleventh");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save search" }),
    );
    expect(
      await within(dialog).findByText("Saved search limit reached (max 10)"),
    ).toBeInTheDocument();
  });

  it("renames and deletes through the API", async () => {
    listSearches.mockResolvedValue([SAVED]);
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    await userEvent.click(
      screen.getByRole("button", { name: "Saved searches" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Rename Python, best fit" }),
    );
    const rename = await screen.findByRole("dialog");
    const input = within(rename).getByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "Python");
    await userEvent.click(
      within(rename).getByRole("button", { name: "Rename" }),
    );
    await waitFor(() =>
      expect(updateSearch).toHaveBeenCalledWith("1", { name: "Python" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(
      screen.getByRole("button", { name: "Saved searches" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Python, best fit" }),
    );
    const confirm = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Delete search" }),
    );
    await waitFor(() => expect(removeSearch).toHaveBeenCalledWith("1"));
  });
});

describe("/jobs behind the jobs feature (KODI-053, PRD 0013)", () => {
  it("shows the app's page not found to a user without jobs, and asks for no job", async () => {
    myFeatures = [];
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "Jobs" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(getMyFeatures).toHaveBeenCalled());
    expect(listJobs).not.toHaveBeenCalled();
    expect(listSearches).not.toHaveBeenCalled();
    expect(getJob).not.toHaveBeenCalled();
  });

  it("shows a spinner and asks for no job while the features load", async () => {
    seedFeatures = false;
    getMyFeatures.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    await waitFor(() => expect(getMyFeatures).toHaveBeenCalled());
    expect(listJobs).not.toHaveBeenCalled();
    expect(listSearches).not.toHaveBeenCalled();
  });

  it("opens the board once the features arrive with jobs", async () => {
    seedFeatures = false;
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Jobs" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(listJobs).toHaveBeenCalled());
  });

  it("puts Beta beside the Jobs h1, outside it, while jobs is in beta", async () => {
    renderPage();

    const heading = screen.getByRole("heading", { level: 1, name: "Jobs" });
    const badge = screen.getByText("Beta");
    expect(heading).not.toContainElement(badge);
    expect(heading.parentElement).toContainElement(badge);
    expect(badge).toHaveAttribute("data-slot", "beta-badge");
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
  });

  it("shows no Beta once jobs is released", async () => {
    myFeatures = [
      { key: "jobs", stage: "general" },
      { key: "cvs", stage: "general" },
    ];
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Jobs" }),
    ).toBeInTheDocument();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });
});

describe("/jobs with jobs but without cvs", () => {
  beforeEach(() => {
    myFeatures = [{ key: "jobs", stage: "beta" }];
  });

  it("shows no fit, no Start application, no invitation and never asks for master CVs", async () => {
    listBaseCvs.mockResolvedValue([]);
    renderPage();

    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    // The API item still carries a best fit: the page strips it anyway.
    expect(within(card).queryByText("Fit 72%")).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: "Start application" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Create a master CV to see how well you fit each job",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Remote jobs from Himalayas and RemoteOK."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/matched against your master CVs/),
    ).not.toBeInTheDocument();
    expect(listBaseCvs).not.toHaveBeenCalled();
  });

  it("shows no sort and no Minimum fit field", async () => {
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    expect(
      screen.queryByRole("combobox", { name: "Sort" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /More filters/ }));
    expect(
      screen.getByRole("combobox", { name: "Published within" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Minimum fit" }),
    ).not.toBeInTheDocument();
  });

  it("drops an old min_fit and sort=fit from the request", async () => {
    setUrl("min_fit=70&sort=fit&source=remoteok");
    renderPage();
    await screen.findByRole("article", { name: "Senior Backend Engineer" });

    const [filters] = lastListCall();
    expect(filters.min_fit).toBeNull();
    expect(filters.sort).toBe("newest");
    expect(filters.source).toBe("remoteok");
    // No phantom count on More filters: the dropped min_fit is not active.
    expect(
      screen.getByRole("button", { name: "More filters" }),
    ).toBeInTheDocument();
  });

  it("shows Draft as text, not a link, and keeps Applied a link", async () => {
    listJobs.mockResolvedValue(
      makePage([
        makeJob({ application: { id: "900", is_draft: true } }),
        makeJob({
          id: "102",
          title: "Platform Engineer",
          application: { id: "901", is_draft: false },
        }),
      ]),
    );
    renderPage();

    const draftCard = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    const draft = draftCard.querySelector(
      '[data-slot="job-status-badge"][data-status="draft"]',
    );
    expect(draft).not.toBeNull();
    expect(draft).toHaveTextContent("Draft");
    expect(
      within(draftCard).queryByRole("link", { name: "Draft" }),
    ).not.toBeInTheDocument();

    const appliedCard = screen.getByRole("article", {
      name: "Platform Engineer",
    });
    expect(
      within(appliedCard).getByRole("link", { name: "Applied" }),
    ).toHaveAttribute("href", "/applications?focus=901");
  });
});
