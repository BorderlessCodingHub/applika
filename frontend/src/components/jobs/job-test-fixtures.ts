/**
 * Test-only builders for the job board suites. Never imported by app code.
 */
import type { BaseCv } from "@/services/types/base-cv";
import type { JobDetail, JobPage, JobSummary } from "@/services/types/jobs";

export function makeJob(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: "101",
    source: { code: "himalayas", name: "Himalayas" },
    title: "Senior Backend Engineer",
    company_name: "Acme Remote",
    location_text: "Worldwide",
    employment_type: "FULL_TIME",
    salary_text: "$120k - $150k",
    tags: ["python", "django"],
    posted_at: "2026-10-09T12:00:00Z",
    job_url: "https://himalayas.app/jobs/101",
    is_active: true,
    best_fit: { base_cv_id: "7", score: 72 },
    dismissed: false,
    application: null,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    ...makeJob(),
    description_text: "We build APIs.\nPython and Postgres every day.",
    company_url: "https://acme.example",
    fits: [
      {
        base_cv_id: "7",
        base_cv_name: "Backend CV",
        score: 72,
        matched_keywords: ["python", "postgres"],
        missing_keywords: ["kubernetes"],
      },
    ],
    ...overrides,
  };
}

export function makePage(
  items: JobSummary[],
  overrides: Partial<JobPage> = {},
): JobPage {
  return {
    items,
    total: items.length,
    page: 1,
    per_page: 25,
    total_pages: items.length > 0 ? 1 : 0,
    ...overrides,
  };
}

/** Only `id` and `name` are read by the job board. */
export function makeCv(id: string, name: string): BaseCv {
  return { id, name } as BaseCv;
}

/** An axios-shaped rejection, as `isAxiosError` sees it. */
export function apiError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}
