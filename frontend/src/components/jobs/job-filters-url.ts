import {
  DEFAULT_JOB_FILTERS,
  JOB_FILTER_LIMITS,
  JOB_SOURCES,
  type JobFilters,
} from "@/services/types/jobs";

/**
 * The /jobs filters live in the URL (Plan corrections 17), with the SAME keys
 * `GET /jobs` takes: `search`, `source`, `tags` (repeated, `?tags=a&tags=b`),
 * `min_fit`, `posted_within_days`, `sort`, `include_dismissed`, plus `page`.
 * Pure: reading never throws, and every value is clamped to the server's range.
 */

interface SearchParamsLike {
  get(name: string): string | null;
  getAll(name: string): string[];
}

/** Far past any real list; past the last page the page itself replaces it. */
const MAX_PAGE = 100_000;

function readInt(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Trimmed, cut to 100 characters, empty dropped, deduped (case-sensitive), at most 10. */
export function normalizeTags(raw: readonly string[]): string[] {
  const tags: string[] = [];
  for (const item of raw) {
    const tag = item.trim().slice(0, JOB_FILTER_LIMITS.tagMax).trim();
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= JOB_FILTER_LIMITS.tagsMax) break;
  }
  return tags;
}

/** Garbage reads as the default; out-of-range numbers are clamped. */
export function filtersFromSearchParams(params: SearchParamsLike): JobFilters {
  const search =
    (params.get("search") ?? "").trim().slice(0, JOB_FILTER_LIMITS.searchMax) ||
    null;
  const rawSource = params.get("source");
  const source = JOB_SOURCES.some((item) => item.code === rawSource)
    ? rawSource
    : null;
  const minFit = readInt(params.get("min_fit"));
  const posted = readInt(params.get("posted_within_days"));
  const dismissed = params.get("include_dismissed");

  return {
    search,
    source,
    tags: normalizeTags(params.getAll("tags")),
    min_fit:
      minFit == null
        ? null
        : clamp(
            minFit,
            JOB_FILTER_LIMITS.minFitMin,
            JOB_FILTER_LIMITS.minFitMax,
          ),
    posted_within_days:
      posted == null
        ? null
        : clamp(
            posted,
            JOB_FILTER_LIMITS.postedWithinMin,
            JOB_FILTER_LIMITS.postedWithinMax,
          ),
    sort: params.get("sort") === "fit" ? "fit" : DEFAULT_JOB_FILTERS.sort,
    include_dismissed: dismissed === "true" || dismissed === "1",
  };
}

/** `?page=`; anything that is not a whole number of at least 1 is page 1. */
export function pageFromSearchParams(params: SearchParamsLike): number {
  const page = readInt(params.get("page"));
  if (page == null || page < 1) return 1;
  // A hand-edited `?page=1e22` would reach the API as "1e+22" (a 422).
  return Math.min(page, MAX_PAGE);
}

/**
 * Defaults are omitted, so `/jobs` with no query IS the default view, and a
 * saved search (which the server returns FULL, defaults included) normalises
 * to the shortest URL. Also the `GET /jobs` query: tags go as REPEATED keys,
 * never axios' `tags[]=`, which the API ignores.
 */
export function filtersToSearchParams(
  filters: JobFilters,
  page = 1,
): URLSearchParams {
  const params = new URLSearchParams();
  const search = filters.search?.trim().slice(0, JOB_FILTER_LIMITS.searchMax);
  if (search) params.set("search", search);
  if (filters.source) params.set("source", filters.source);
  for (const tag of normalizeTags(filters.tags)) params.append("tags", tag);
  if (filters.min_fit != null) {
    params.set(
      "min_fit",
      String(
        clamp(
          Math.round(filters.min_fit),
          JOB_FILTER_LIMITS.minFitMin,
          JOB_FILTER_LIMITS.minFitMax,
        ),
      ),
    );
  }
  if (filters.posted_within_days != null) {
    params.set(
      "posted_within_days",
      String(
        clamp(
          Math.round(filters.posted_within_days),
          JOB_FILTER_LIMITS.postedWithinMin,
          JOB_FILTER_LIMITS.postedWithinMax,
        ),
      ),
    );
  }
  if (filters.sort !== DEFAULT_JOB_FILTERS.sort)
    params.set("sort", filters.sort);
  if (filters.include_dismissed) params.set("include_dismissed", "true");
  if (page > 1) params.set("page", String(Math.floor(page)));
  return params;
}

/** Two filter sets are the same view when they serialise the same. */
export function sameJobFilters(a: JobFilters, b: JobFilters): boolean {
  return (
    filtersToSearchParams(a).toString() === filtersToSearchParams(b).toString()
  );
}

/** Only `JobFilters` keys, normalised: what a saved search's body carries (an unknown key is a 422). */
export function normalizeJobFilters(filters: JobFilters): JobFilters {
  return filtersFromSearchParams(filtersToSearchParams(filters));
}
