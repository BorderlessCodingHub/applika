import { describe, expect, it } from "vitest";

import {
  filtersFromSearchParams,
  filtersToSearchParams,
  normalizeJobFilters,
  pageFromSearchParams,
  sameJobFilters,
} from "./job-filters-url";
import { DEFAULT_JOB_FILTERS, type JobFilters } from "@/services/types/jobs";

const read = (query: string) =>
  filtersFromSearchParams(new URLSearchParams(query));

describe("job filters in the URL (T079, Plan corrections 17)", () => {
  it("reads an empty query as the defaults", () => {
    expect(read("")).toEqual(DEFAULT_JOB_FILTERS);
    expect(filtersToSearchParams(DEFAULT_JOB_FILTERS).toString()).toBe("");
  });

  it("round-trips every filter, with tags as repeated keys", () => {
    const filters: JobFilters = {
      search: "backend engineer",
      source: "remoteok",
      tags: ["python", "Django"],
      min_fit: 60,
      posted_within_days: 7,
      sort: "fit",
      include_dismissed: true,
    };
    const query = filtersToSearchParams(filters, 3).toString();

    expect(query).toBe(
      "search=backend+engineer&source=remoteok&tags=python&tags=Django&min_fit=60&posted_within_days=7&sort=fit&include_dismissed=true&page=3",
    );
    expect(read(query)).toEqual(filters);
    expect(pageFromSearchParams(new URLSearchParams(query))).toBe(3);
  });

  it("omits every default: newest, no dismissed, page 1, empty search", () => {
    const query = filtersToSearchParams(
      {
        ...DEFAULT_JOB_FILTERS,
        search: "   ",
        sort: "newest",
        include_dismissed: false,
      },
      1,
    ).toString();
    expect(query).toBe("");
  });

  it("clamps numbers to the contract ranges", () => {
    expect(read("min_fit=150").min_fit).toBe(100);
    expect(read("min_fit=-5").min_fit).toBe(0);
    expect(read("min_fit=0").min_fit).toBe(0);
    expect(read("min_fit=55.4").min_fit).toBe(55);
    expect(read("posted_within_days=0").posted_within_days).toBe(1);
    expect(read("posted_within_days=99").posted_within_days).toBe(15);
  });

  it("reads garbage as the default", () => {
    expect(
      read(
        "min_fit=lots&posted_within_days=&sort=oldest&source=linkedin&include_dismissed=maybe&tags=&tags=%20%20",
      ),
    ).toEqual(DEFAULT_JOB_FILTERS);
    expect(pageFromSearchParams(new URLSearchParams("page=-2"))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams("page=abc"))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams("page=1e22"))).toBe(100000);
  });

  it("trims, dedupes (case-sensitively) and caps tags at 10 of 100 characters", () => {
    const long = "x".repeat(140);
    const tags = read(
      [
        " go ",
        "go",
        "Go",
        long,
        ...Array.from({ length: 12 }, (_, i) => `t${i}`),
      ]
        .map((tag) => `tags=${encodeURIComponent(tag)}`)
        .join("&"),
    ).tags;

    expect(tags).toHaveLength(10);
    expect(tags.slice(0, 3)).toEqual(["go", "Go", "x".repeat(100)]);
  });

  it("cuts the search to 200 characters", () => {
    expect(read(`search=${"a".repeat(250)}`).search).toHaveLength(200);
  });

  it("normalises a FULL saved-search filter set to only the non-defaults", () => {
    const saved: JobFilters = { ...DEFAULT_JOB_FILTERS, tags: ["rust"] };
    expect(filtersToSearchParams(saved).toString()).toBe("tags=rust");
    expect(Object.keys(normalizeJobFilters(saved)).sort()).toEqual(
      Object.keys(DEFAULT_JOB_FILTERS).sort(),
    );
    expect(sameJobFilters(saved, read("tags=rust"))).toBe(true);
    expect(sameJobFilters(saved, DEFAULT_JOB_FILTERS)).toBe(false);
  });
});
