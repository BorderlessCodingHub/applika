import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobViewPage } from "@/app/(protected)/jobs/view/job-view-page";
import {
  apiError,
  makeCv,
  makeDetail,
} from "@/components/jobs/job-test-fixtures";
import type { BaseCv } from "@/services/types/base-cv";
import type { MyFeature } from "@/services/types/features";
import type { JobDetail } from "@/services/types/jobs";
import { pathname, routerPush, setLocation } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

/**
 * `/jobs/view?id=` below md: v2/JobDetail on today's hooks, inside today's
 * `jobs` gate, with Start application as v2/StartApplication's sheet on
 * today's start flow.
 */

const mocks = vi.hoisted(() => ({
  features: { current: [] as MyFeature[] },
  getJob: vi.fn(),
  dismissJob: vi.fn(),
  restoreJob: vi.fn(),
  listBaseCvs: vi.fn(),
  createFromJob: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: () => Promise.resolve(mocks.features.current) },
    jobs: {
      list: vi.fn(),
      get: (...args: unknown[]) => mocks.getJob(...args),
      dismiss: (...args: unknown[]) => mocks.dismissJob(...args),
      restore: (...args: unknown[]) => mocks.restoreJob(...args),
    },
    baseCvs: { list: (...args: unknown[]) => mocks.listBaseCvs(...args) },
    applicationDrafts: {
      createFromJob: (...args: unknown[]) => mocks.createFromJob(...args),
    },
  },
}));

const JOBS: MyFeature[] = [{ key: "jobs", stage: "beta" }];
const JOBS_AND_CVS: MyFeature[] = [...JOBS, { key: "cvs", stage: "beta" }];
const BACKEND_CV = {
  ...makeCv("7", "Backend CV"),
  updated_at: "2026-10-30T10:00:00Z",
} as BaseCv;

let job: JobDetail;

beforeEach(() => {
  mocks.features.current = JOBS_AND_CVS;
  job = makeDetail();
  mocks.getJob.mockReset().mockImplementation(async () => job);
  mocks.dismissJob.mockReset().mockImplementation(async () => {
    job = { ...job, dismissed: true };
  });
  mocks.restoreJob.mockReset().mockImplementation(async () => {
    job = { ...job, dismissed: false };
  });
  mocks.listBaseCvs.mockReset().mockResolvedValue([BACKEND_CV]);
  mocks.createFromJob.mockReset().mockResolvedValue({ id: "d1" });
  routerPush.mockReset();
  pathname.current = "/jobs/view";
  setLocation("/jobs/view?id=101");
});

const renderJob = (features: MyFeature[] = JOBS_AND_CVS) => {
  mocks.features.current = features;
  return renderPhoneScreen("/jobs/view", <JobViewPage />, { features });
};

describe("a job below md", () => {
  it("renders the JobDetail board: back to Jobs, company site, h1, tags, Your fit and the description", async () => {
    await renderJob();

    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "href",
      "/jobs",
    );
    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    expect(h1).toHaveClass("ph-h1", "ph-jd-h1");
    const site = within(bar).getByRole("link", { name: "Company website" });
    expect(site).toHaveAttribute("href", "https://acme.example");
    expect(site).toHaveAttribute("target", "_blank");
    expect(site).toHaveClass("ph-iconbtn");
    const meta = document.querySelector(".ph-jd-meta")!;
    expect(meta.textContent).toMatch(/^Acme Remote · Himalayas · \S/);
    expect(meta.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-09T12:00:00Z",
    );
    // The job's tags, then today's location, employment and salary as tags.
    const tags = document.querySelector(".ph-jd-tags") as HTMLElement;
    for (const tag of ["python", "django", "Worldwide", "$120k - $150k"]) {
      expect(within(tags).getByText(tag)).toHaveClass("ph-tag");
    }

    const fit = screen.getByRole("region", { name: "Your fit" });
    expect(fit).toHaveAttribute("data-slot", "job-fit-list");
    const tabs = within(fit).getByRole("tablist", { name: "Master CV" });
    expect(
      within(tabs).getByRole("tab", { name: "Backend CV · 72%" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(fit).getByRole("heading", { level: 3, name: "Backend CV" }),
    ).toBeInTheDocument();
    expect(within(fit).getByRole("img", { name: "Fit 72%" })).toHaveAttribute(
      "data-band",
      "strong",
    );
    expect(within(fit).getByText("Strong fit")).toBeInTheDocument();
    const matched = fit.querySelector(
      '[data-slot="fit-keyword-group"][data-kind="matched"]',
    ) as HTMLElement;
    expect(within(matched).getByText("python")).toHaveClass("ph-kw", "ph-m");
    const missing = fit.querySelector(
      '[data-slot="fit-keyword-group"][data-kind="missing"]',
    ) as HTMLElement;
    expect(within(missing).getByText("kubernetes")).toHaveClass(
      "ph-kw",
      "ph-x",
    );

    const description = screen.getByRole("region", { name: "Description" });
    expect(within(description).getByText(/We build APIs\./)).toHaveClass(
      "ph-jd-desc",
    );
    expect(
      within(description).getByRole("link", { name: /View on Himalayas/ }),
    ).toHaveAttribute("href", "https://himalayas.app/jobs/101");

    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(dismiss).toHaveClass("ph-btn", "ph-sec", "ph-jd-dismiss");
    expect(dismiss.closest(".ph-bar")).not.toBeNull();
    const start = screen.getByRole("button", { name: "Start application" });
    expect(start).toHaveClass("ph-btn", "ph-pri", "ph-jd-start");
    expect(start).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("holds one tab and one heading per master CV, best first, a CV without a fit last", async () => {
    const user = userEvent.setup();
    mocks.listBaseCvs.mockResolvedValue([
      makeCv("8", "Frontend CV"),
      BACKEND_CV,
    ]);
    await renderJob();
    const fit = await screen.findByRole("region", { name: "Your fit" });

    const tabs = await within(fit).findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Backend CV · 72%",
      "Frontend CV · No fit yet",
    ]);
    expect(
      within(fit)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Backend CV", "Frontend CV"]);

    await user.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    const panel = fit.querySelector(
      '[role="tabpanel"][data-state="active"]',
    ) as HTMLElement;
    expect(
      within(panel).getByText("This job has no keywords to compare yet."),
    ).toBeInTheDocument();
  });

  it("starts an application in the StartApplication sheet: the lone CV and Verbatim copy preselected, then Create draft", async () => {
    const user = userEvent.setup();
    await renderJob();
    const start = await screen.findByRole("button", {
      name: "Start application",
    });

    await user.click(start);
    const sheet = screen.getByRole("dialog", { name: "Start an application" });
    expect(sheet).toHaveAccessibleDescription(
      "Creates a draft from Senior Backend Engineer at Acme Remote. You finish it on the next page.",
    );
    const cvGroup = within(sheet).getByRole("radiogroup", {
      name: "Master CV",
    });
    expect(
      within(cvGroup).getByRole("radio", { name: "Backend CV" }),
    ).toBeChecked();
    expect(
      within(cvGroup).getByRole("radio", { name: "Backend CV" }),
    ).toHaveAccessibleDescription(/^Fit 72% · updated Oct 30/);
    expect(
      within(cvGroup).getByRole("radio", { name: "Without a CV" }),
    ).not.toBeChecked();
    const copyGroup = within(sheet).getByRole("radiogroup", {
      name: "CV copy",
    });
    expect(
      within(copyGroup).getByRole("radio", { name: "Verbatim copy" }),
    ).toBeChecked();
    await user.click(
      within(copyGroup).getByRole("radio", { name: "Tailor by keywords" }),
    );

    await user.click(
      within(sheet).getByRole("button", { name: "Create draft" }),
    );
    expect(mocks.createFromJob).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "101",
        base_cv_id: "7",
        tailoring: "keywords",
      }),
    );
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(
        "/applications/new-with-cv?id=d1&step=cv",
      ),
    );
  });

  it("offers no CV copy without a CV and no Tailor by keywords for a blank description", async () => {
    const user = userEvent.setup();
    job = makeDetail({ description_text: "   " });
    await renderJob();
    await user.click(
      await screen.findByRole("button", { name: "Start application" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Start an application" });

    expect(
      within(sheet).queryByRole("radio", { name: "Tailor by keywords" }),
    ).toBeNull();
    await user.click(
      within(sheet).getByRole("radio", { name: "Without a CV" }),
    );
    expect(
      within(sheet).queryByRole("radiogroup", { name: "CV copy" }),
    ).toBeNull();
    await user.click(
      within(sheet).getByRole("button", { name: "Create draft" }),
    );
    expect(mocks.createFromJob).toHaveBeenCalledWith(
      expect.not.objectContaining({ base_cv_id: expect.anything() }),
    );
  });

  it("turns a 409 into Open draft, and Cancel closes the sheet back to Start application", async () => {
    const user = userEvent.setup();
    mocks.createFromJob.mockImplementation(async () => {
      job = { ...job, application: { id: "d9", is_draft: true } };
      throw apiError(409, "You already started this job");
    });
    await renderJob();
    const start = await screen.findByRole("button", {
      name: "Start application",
    });
    await user.click(start);
    const sheet = screen.getByRole("dialog", { name: "Start an application" });
    await user.click(
      within(sheet).getByRole("button", { name: "Create draft" }),
    );

    const conflict = await within(sheet).findByRole("alert");
    expect(conflict).toHaveAttribute("data-slot", "start-application-conflict");
    expect(conflict).toHaveTextContent(
      "You already have an application for this job",
    );
    expect(
      within(conflict).getByRole("link", { name: "Open draft" }),
    ).toHaveAttribute("href", "/applications/new-with-cv?id=d9");
    // The sheet's X is "Close" too; the conflict's own Close comes last.
    const closes = within(sheet).getAllByRole("button", { name: "Close" });
    expect(closes).toHaveLength(2);
    await user.click(closes[1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a 404/422 detail inline, and Cancel closes the sheet", async () => {
    const user = userEvent.setup();
    mocks.createFromJob.mockRejectedValue(
      apiError(422, "This job has no title to start from"),
    );
    await renderJob();
    const start = await screen.findByRole("button", {
      name: "Start application",
    });
    await user.click(start);
    const sheet = screen.getByRole("dialog", { name: "Start an application" });
    await user.click(
      within(sheet).getByRole("button", { name: "Create draft" }),
    );

    expect(
      await within(sheet).findByText("This job has no title to start from"),
    ).toBeInTheDocument();
    expect(
      sheet.querySelector('[data-slot="start-application-error"]'),
    ).toHaveAttribute("role", "alert");
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(start).toHaveFocus();
  });

  it("dismisses and restores from the bar", async () => {
    const user = userEvent.setup();
    await renderJob();
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));

    expect(mocks.dismissJob).toHaveBeenCalledWith("101");
    const restore = await screen.findByRole("button", { name: "Restore" });
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    await user.click(restore);
    expect(mocks.restoreJob).toHaveBeenCalledWith("101");
    expect(
      await screen.findByRole("button", { name: "Dismiss" }),
    ).toBeInTheDocument();
  });

  it("without cvs: no Your fit, no Start, no CV request, and a Draft mark is plain text", async () => {
    job = makeDetail({ application: { id: "d9", is_draft: true }, fits: [] });
    await renderJob(JOBS);

    await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    expect(screen.queryByRole("region", { name: "Your fit" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Start application" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Draft" })).toBeNull();
    expect(
      document.querySelector('[data-slot="job-status-badge"]'),
    ).toHaveTextContent("Draft");
    expect(mocks.listBaseCvs).not.toHaveBeenCalled();
  });

  it("without jobs: page not found and no job request", async () => {
    await renderJob([{ key: "cvs", stage: "beta" }]);
    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(mocks.getJob).not.toHaveBeenCalled();
  });

  it("says a 404 job is no longer listed, with no bar", async () => {
    mocks.getJob.mockRejectedValue(apiError(404, "Not found"));
    await renderJob();

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
    expect(document.querySelector(".ph-bar")).toBeNull();
  });

  it("loads, then fails with its h1 and a Retry that refetches", async () => {
    const user = userEvent.setup();
    mocks.getJob.mockRejectedValueOnce(apiError(500, "Jobs are down"));
    await renderJob();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading this job");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Could not load this job",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jobs are down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Senior Backend Engineer",
      }),
    ).toBeInTheDocument();
  });

  it("swaps to today's page at md", async () => {
    mocks.features.current = JOBS_AND_CVS;
    const { viewport } = renderPhonePage(<JobViewPage />, {
      features: JOBS_AND_CVS,
    });
    await screen.findByRole("heading", {
      level: 1,
      name: "Senior Backend Engineer",
    });
    expect(
      document.querySelector('[data-slot="phone-job-detail"]'),
    ).not.toBeNull();

    viewport.setPhone(false);
    expect(document.querySelector('[data-slot="phone-job-detail"]')).toBeNull();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Senior Backend Engineer",
      }),
    ).toBeInTheDocument();
  });
});
