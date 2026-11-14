"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import {
  filtersFromSearchParams,
  filtersToSearchParams,
  normalizeJobFilters,
  pageFromSearchParams,
  sameJobFilters,
} from "@/components/jobs/job-filters-url";
import type {
  SavedSearchOutcome,
  SavedSearchesMenuProps,
} from "@/components/jobs/saved-searches-menu";
import {
  useCreateJobSearch,
  useDeleteJobSearch,
  useJobSearches,
  useUpdateJobSearch,
} from "@/hooks/use-job-searches";
import { apiStatus, jobApiDetail } from "@/hooks/use-jobs";
import type { JobSearch } from "@/services/types/job-searches";
import type { JobFilters } from "@/services/types/jobs";

/**
 * The job board's URL and saved-search wiring, shared by `/jobs` at both
 * widths (today's page and the phone's v2/Jobs screen).
 */

/**
 * Filters and page live in the URL (Plan corrections 17): read through
 * `useSearchParams`, written through the History API, which Next keeps in
 * sync with `useSearchParams`. `router.replace` with only a new query is a
 * no-op on this static export.
 */
export function writeJobsUrl(
  filters: JobFilters,
  page = 1,
  mode: "push" | "replace" = "push",
) {
  const query = filtersToSearchParams(filters, page).toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Fit, "Start application" (with its "Tailor by keywords"), the master CV
 * invitation and a draft link need `cvs` too. Without it the server sends no
 * fit, and an old `?min_fit=` or `sort=fit` (a link, a saved search) is
 * dropped here, since no control is left to clear it.
 */
export function withoutFit(filters: JobFilters): JobFilters {
  return {
    ...filters,
    min_fit: null,
    sort: filters.sort === "fit" ? "newest" : filters.sort,
  };
}

/** The URL's filters (without fit when the user has no `cvs`) and `?page=`. */
export function useUrlJobFilters(hasCvs: boolean): {
  filters: JobFilters;
  page: number;
} {
  const searchParams = useSearchParams();
  const filters = useMemo(() => {
    const fromUrl = filtersFromSearchParams(searchParams);
    return hasCvs ? fromUrl : withoutFit(fromUrl);
  }, [searchParams, hasCvs]);
  return { filters, page: pageFromSearchParams(searchParams) };
}

/** A 4xx `detail` shows inline in the saved-search dialog; anything else is the menu's generic error. */
function savedSearchOutcome(error: unknown): SavedSearchOutcome {
  const status = apiStatus(error);
  const detail = jobApiDetail(error, "");
  if (status && status < 500 && detail) return detail;
  throw error;
}

/** Everything `SavedSearchesMenu` takes but its `className`, for the current filters. */
export function useSavedSearchesMenu(
  filters: JobFilters,
  hasCvs: boolean,
): Omit<SavedSearchesMenuProps, "className" | "max"> {
  const searches = useJobSearches();
  const createSearch = useCreateJobSearch();
  const updateSearch = useUpdateJobSearch();
  const deleteSearch = useDeleteJobSearch();

  // Without `cvs` a search saved with a fit sort or minimum reads (and
  // applies, and matches the board) without them, like the URL does.
  const savedSearches = useMemo(
    () =>
      hasCvs
        ? searches.data
        : searches.data?.map((search) => ({
            ...search,
            filters: withoutFit(search.filters),
          })),
    [searches.data, hasCvs],
  );

  const activeSearchId =
    savedSearches?.find((search) => sameJobFilters(search.filters, filters))
      ?.id ?? null;

  async function saveSearch(name: string): Promise<SavedSearchOutcome> {
    try {
      await createSearch.mutateAsync({
        name,
        filters: normalizeJobFilters(filters),
      });
    } catch (error) {
      return savedSearchOutcome(error);
    }
  }

  async function renameSearch(
    search: JobSearch,
    name: string,
  ): Promise<SavedSearchOutcome> {
    try {
      await updateSearch.mutateAsync({ id: search.id, data: { name } });
    } catch (error) {
      return savedSearchOutcome(error);
    }
  }

  async function removeSearch(search: JobSearch): Promise<SavedSearchOutcome> {
    try {
      await deleteSearch.mutateAsync(search.id);
    } catch (error) {
      return savedSearchOutcome(error);
    }
  }

  return {
    searches: savedSearches,
    isLoading: searches.isLoading,
    error: searches.isError ? jobApiDetail(searches.error) : null,
    onRetry: () => void searches.refetch(),
    activeId: activeSearchId,
    onApply: (search) => writeJobsUrl(normalizeJobFilters(search.filters)),
    onSave: saveSearch,
    onRename: renameSearch,
    onDelete: removeSearch,
  };
}
