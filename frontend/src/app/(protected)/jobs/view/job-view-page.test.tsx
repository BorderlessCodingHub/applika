import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import type { MyFeature } from "@/services/types/features";
import { localCalendarDay } from "@/components/application-drafts/draft-copy";
import { JobViewPage } from "./job-view-page";
import {
  apiError,
  makeCv,
  makeDetail,
} from "@/components/jobs/job-test-fixtures";

/** `/jobs/view?id=` (T084): AC4, AC5, AC10, AC11, and the 404. */

const getJob = vi.fn();
const dismissJob = vi.fn();
const restoreJob = vi.fn();
const listBaseCvs = vi.fn();
const createFromJob = vi.fn();
const push = vi.fn();

/**
 * The cases written before PRD 0013 run with `jobs` in beta, and with `cvs`
 * too: the fit and Start need both.
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
      get: (...args: unknown[]) => getJob(...args),
      dismiss: (...args: unknown[]) => dismissJob(...args),
      restore: (...args: unknown[]) => restoreJob(...args),
    },
    baseCvs: { list: (...args: unknown[]) => listBaseCvs(...args) },
    applicationDrafts: {
      createFromJob: (...args: unknown[]) => createFromJob(...args),
    },
  },
}));

let searchParams = new URLSearchParams("id=101");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seeded, as after the shell's own fetch: the gate opens on the first frame.
  if (seedFeatures) client.setQueryData(MY_FEATURES_QUERY_KEY, myFeatures);
  return render(
    <QueryClientProvider client={client}>
      <JobViewPage />
    </QueryClientProvider>,
  );
}

const TWO_FITS = makeDetail({
  fits: [
    {
      base_cv_id: "8",
      base_cv_name: "Data CV",
      score: 35,
      matched_keywords: ["python"],
      missing_keywords: ["django", "postgres"],
    },
    {
      base_cv_id: "7",
      base_cv_name: "Backend CV",
      score: 80,
      matched_keywords: ["python", "django", "postgres"],
      missing_keywords: [],
    },
  ],
});

beforeEach(() => {
  myFeatures = JOBS_AND_CVS;
  seedFeatures = true;
  getMyFeatures.mockReset().mockImplementation(async () => myFeatures);
  searchParams = new URLSearchParams("id=101");
  getJob.mockReset().mockResolvedValue(TWO_FITS);
  dismissJob.mockReset().mockResolvedValue(undefined);
  restoreJob.mockReset().mockResolvedValue(undefined);
  listBaseCvs
    .mockReset()
    // Deliberately NOT best-first: the fit list sorts them.
    .mockResolvedValue([
      makeCv("9", "Design CV"),
      makeCv("8", "Data CV"),
      makeCv("7", "Backend CV"),
    ]);
  createFromJob.mockReset().mockResolvedValue({ id: "555" });
  push.mockReset();
});

describe("/jobs/view (AC4)", () => {
  it("shows the full description and a link to the source posting", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Senior Backend Engineer",
      }),
    ).toBeInTheDocument();
    expect(getJob).toHaveBeenCalledWith("101");
    expect(screen.getByText(/We build APIs\./)).toHaveTextContent(
      "We build APIs. Python and Postgres every day.",
    );

    const source = screen.getByRole("link", { name: "View on Himalayas" });
    expect(source).toHaveAttribute("href", "https://himalayas.app/jobs/101");
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByRole("link", { name: "Company website" }),
    ).toHaveAttribute("href", "https://acme.example");
  });

  it("shows each master CV's fit with the matched and missing keywords, best first", async () => {
    renderPage();
    const fit = await screen.findByRole("region", { name: "Your fit" });
    await waitFor(() =>
      expect(within(fit).getAllByRole("heading", { level: 3 })).toHaveLength(3),
    );
    expect(
      within(fit)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Backend CV", "Data CV", "Design CV"]);

    const data = fit.querySelector('li[data-base-cv-id="8"]') as HTMLElement;
    expect(within(data).getByText("Fit 35%")).toBeInTheDocument();
    expect(
      within(within(data).getByRole("list", { name: "Matched" })).getByText(
        "python",
      ),
    ).toBeInTheDocument();
    const missing = within(data).getByRole("list", { name: "Missing" });
    expect(within(missing).getByText("django")).toBeInTheDocument();
    expect(within(missing).getByText("postgres")).toBeInTheDocument();

    const backend = fit.querySelector('li[data-base-cv-id="7"]') as HTMLElement;
    expect(within(backend).getByText("Fit 80%")).toBeInTheDocument();
    expect(
      within(backend).getByText("This CV covers every keyword."),
    ).toBeInTheDocument();

    // A CV the server has no fit for yet renders, without crashing.
    const design = fit.querySelector('li[data-base-cv-id="9"]') as HTMLElement;
    expect(within(design).getByText("No fit yet")).toBeInTheDocument();
  });

  it("invites a user with no master CV instead of any fit (AC5)", async () => {
    listBaseCvs.mockResolvedValue([]);
    getJob.mockResolvedValue(makeDetail({ fits: [], best_fit: null }));
    renderPage();
    expect(
      await screen.findByRole("link", {
        name: "Create a master CV to see how well you fit each job",
      }),
    ).toHaveAttribute("href", "/cvs/new");
    expect(screen.queryByText(/^Fit \d+%$/)).toBeNull();
  });
});

describe("/jobs/view: scraped links", () => {
  it("renders no link for a non-http(s) job or company URL", async () => {
    getJob.mockResolvedValue(
      makeDetail({
        job_url: "javascript:alert(1)",
        company_url: "data:text/html,hi",
      }),
    );
    renderPage();
    await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    expect(screen.queryByRole("link", { name: /View on/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Company website" })).toBeNull();
  });

  it("says so when the description is blank", async () => {
    getJob.mockResolvedValue(makeDetail({ description_text: "   " }));
    renderPage();
    expect(
      await screen.findByText("This job has no description."),
    ).toBeInTheDocument();
  });
});

describe("/jobs/view: not listed", () => {
  it("says the job is no longer listed on a 404, with a way back", async () => {
    getJob.mockRejectedValue(apiError(404, "Job not found"));
    renderPage();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This job is no longer listed",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to jobs" })).toHaveAttribute(
      "href",
      "/jobs",
    );
  });

  it("says the same with no id at all", async () => {
    searchParams = new URLSearchParams("");
    renderPage();
    expect(
      screen.getByRole("heading", { name: "This job is no longer listed" }),
    ).toBeInTheDocument();
    expect(getJob).not.toHaveBeenCalled();
  });

  it("shows another error as an alert", async () => {
    getJob.mockRejectedValue(apiError(500, "Database is down"));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load this job");
    expect(alert).toHaveTextContent("Database is down");
  });

  it("explains an inactive job the user started an application from", async () => {
    getJob.mockResolvedValue(
      makeDetail({
        is_active: false,
        application: { id: "901", is_draft: false },
      }),
    );
    renderPage();
    expect(
      await screen.findByText(
        "This job is no longer listed. You still see it because you started an application from it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Applied" })).toHaveAttribute(
      "href",
      "/applications?focus=901",
    );
  });
});

describe("/jobs/view: actions", () => {
  it("dismisses and restores in place (AC10)", async () => {
    let dismissed = false;
    getJob.mockImplementation(() =>
      Promise.resolve({ ...TWO_FITS, dismissed }),
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

    await userEvent.click(
      await screen.findByRole("button", { name: "Dismiss" }),
    );
    expect(dismissJob).toHaveBeenCalledWith("101");
    const restore = await screen.findByRole("button", { name: "Restore" });
    expect(screen.getByText("Dismissed")).toBeInTheDocument();

    await userEvent.click(restore);
    expect(restoreJob).toHaveBeenCalledWith("101");
    expect(
      await screen.findByRole("button", { name: "Dismiss" }),
    ).toBeInTheDocument();
  });

  it("starts an application from the detail, landing on the CV step", async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole("button", { name: "Start application" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Start an application",
    });
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: "Backend CV" }),
    );
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Tailor by keywords" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create draft" }),
    );
    await waitFor(() =>
      expect(createFromJob).toHaveBeenCalledWith({
        job_id: "101",
        base_cv_id: "7",
        tailoring: "keywords",
        application_date: localCalendarDay(),
      }),
    );
    expect(push).toHaveBeenCalledWith(
      "/applications/new-with-cv?id=555&step=cv",
    );
  });

  it("offers 'Open application' when a no-longer-listed job answers 404 (AC8)", async () => {
    getJob.mockResolvedValue(
      makeDetail({
        is_active: false,
        application: { id: "901", is_draft: false },
      }),
    );
    createFromJob.mockRejectedValue(apiError(404, "Job not found"));
    renderPage();
    await userEvent.click(
      await screen.findByRole("button", { name: "Start application" }),
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(listBaseCvs).toHaveBeenCalled());
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create draft" }),
    );
    expect(
      await within(dialog).findByRole("link", { name: "Open application" }),
    ).toHaveAttribute("href", "/applications?focus=901");
    expect(within(dialog).queryByText("Job not found")).toBeNull();
  });

  it("shows the Draft link and still offers Start application (AC8, AC11)", async () => {
    getJob.mockResolvedValue(
      makeDetail({ application: { id: "900", is_draft: true } }),
    );
    renderPage();
    expect(await screen.findByRole("link", { name: "Draft" })).toHaveAttribute(
      "href",
      "/applications/new-with-cv?id=900",
    );
    expect(
      screen.getByRole("button", { name: "Start application" }),
    ).toBeInTheDocument();
  });
});

describe("/jobs/view behind the jobs feature (KODI-053, PRD 0013)", () => {
  it("shows the app's page not found to a user without jobs, and asks for no job", async () => {
    myFeatures = [];
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to Home" }),
    ).toHaveAttribute("href", "/");
    await waitFor(() => expect(getMyFeatures).toHaveBeenCalled());
    expect(getJob).not.toHaveBeenCalled();
  });

  it("shows a spinner and asks for no job while the features load", async () => {
    seedFeatures = false;
    getMyFeatures.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    await waitFor(() => expect(getMyFeatures).toHaveBeenCalled());
    expect(getJob).not.toHaveBeenCalled();
  });

  it("puts Beta beside the job title, outside the h1, while jobs is in beta", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    const badge = screen.getByText("Beta");
    expect(heading).not.toContainElement(badge);
    expect(heading.parentElement).toContainElement(badge);
  });

  it("shows no Beta once jobs is released", async () => {
    myFeatures = [
      { key: "jobs", stage: "general" },
      { key: "cvs", stage: "general" },
    ];
    renderPage();

    await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("shows no Beta on the job-no-longer-listed page", async () => {
    getJob.mockRejectedValue(apiError(404, "Not Found"));
    renderPage();

    await screen.findByText("This job is no longer listed");
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });
});

describe("/jobs/view with jobs but without cvs", () => {
  beforeEach(() => {
    myFeatures = [{ key: "jobs", stage: "beta" }];
  });

  it("shows the description but no fit, no Start application and never asks for master CVs", async () => {
    getJob.mockResolvedValue(makeDetail({ fits: [], best_fit: null }));
    renderPage();

    await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    expect(screen.getByText(/We build APIs\./)).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Your fit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Create a master CV to see how well you fit each job",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start application" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Fit \d+%$/)).toBeNull();
    expect(listBaseCvs).not.toHaveBeenCalled();
  });

  it("shows Draft as text, not a link", async () => {
    getJob.mockResolvedValue(
      makeDetail({
        application: { id: "900", is_draft: true },
        fits: [],
        best_fit: null,
      }),
    );
    const { container } = renderPage();

    await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    const draft = container.querySelector(
      '[data-slot="job-status-badge"][data-status="draft"]',
    );
    expect(draft).toHaveTextContent("Draft");
    expect(
      screen.queryByRole("link", { name: "Draft" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Applied a link", async () => {
    getJob.mockResolvedValue(
      makeDetail({
        application: { id: "901", is_draft: false },
        fits: [],
        best_fit: null,
      }),
    );
    renderPage();

    expect(
      await screen.findByRole("link", { name: "Applied" }),
    ).toHaveAttribute("href", "/applications?focus=901");
  });
});
