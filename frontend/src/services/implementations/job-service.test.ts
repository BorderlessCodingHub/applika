import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const put = vi.fn();
const del = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { JobService, jobListQuery } from "./job-service";
import { ApplicationDraftService } from "./application-draft-service";
import { JobSearchService } from "./job-search-service";
import { DEFAULT_JOB_FILTERS } from "@/services/types/jobs";

beforeEach(() => {
  for (const fn of [get, put, del, post]) {
    fn.mockReset();
    fn.mockResolvedValue({ data: {} });
  }
});

describe("JobService (T078)", () => {
  it("sends tags as REPEATED keys, never axios' tags[]", async () => {
    await new JobService().list(
      {
        search: "rust dev",
        source: "himalayas",
        tags: ["python", "C++"],
        min_fit: 0,
        posted_within_days: 7,
        sort: "fit",
        include_dismissed: true,
      },
      2,
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]).toEqual([
      "/jobs?search=rust+dev&source=himalayas&tags=python&tags=C%2B%2B&min_fit=0&posted_within_days=7&sort=fit&include_dismissed=true&page=2&per_page=25",
    ]);
  });

  it("omits every default and asks for 25 per page", () => {
    expect(jobListQuery(DEFAULT_JOB_FILTERS, 1)).toBe("page=1&per_page=25");
  });

  it("dismisses and restores through the dismissal route", async () => {
    const service = new JobService();
    await service.dismiss("101");
    await service.restore("101");
    await service.get("101");
    expect(put).toHaveBeenCalledWith("/jobs/101/dismissal");
    expect(del).toHaveBeenCalledWith("/jobs/101/dismissal");
    expect(get).toHaveBeenCalledWith("/jobs/101");
  });
});

describe("ApplicationDraftService.createFromJob (T078)", () => {
  it("posts the job, the CV, the tailoring and the local day", async () => {
    await new ApplicationDraftService().createFromJob({
      job_id: "101",
      base_cv_id: "7",
      tailoring: "keywords",
      application_date: "2026-10-12",
    });
    expect(post).toHaveBeenCalledWith("/applications/drafts/from-job", {
      job_id: "101",
      base_cv_id: "7",
      tailoring: "keywords",
      application_date: "2026-10-12",
    });
  });
});

describe("JobSearchService (T078)", () => {
  it("speaks the /job-searches CRUD", async () => {
    const service = new JobSearchService();
    const body = { name: "Rust", filters: DEFAULT_JOB_FILTERS };
    await service.list();
    await service.create(body);
    await service.update("5", { name: "Rust jobs" });
    await service.remove("5");
    expect(get).toHaveBeenCalledWith("/job-searches");
    expect(post).toHaveBeenCalledWith("/job-searches", body);
    expect(put).toHaveBeenCalledWith("/job-searches/5", { name: "Rust jobs" });
    expect(del).toHaveBeenCalledWith("/job-searches/5");
  });
});
