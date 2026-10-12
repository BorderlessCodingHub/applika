"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { JobFiltersToolbar } from "@/components/jobs/job-filters";
import {
  JOBS_COPY,
  clearJobFilters,
  hasAnyJobFilter,
} from "@/components/jobs/job-copy";
import {
  filtersFromSearchParams,
  filtersToSearchParams,
  normalizeJobFilters,
  pageFromSearchParams,
  sameJobFilters,
} from "@/components/jobs/job-filters-url";
import {
  JobListItem,
  type JobMarkPending,
} from "@/components/jobs/job-list-item";
import {
  JobListEmpty,
  JobListNoMatches,
  JobListPager,
  JobListSkeleton,
  JobLoadError,
  JobResultsCount,
} from "@/components/jobs/job-list-states";
import { MasterCvInvitation } from "@/components/jobs/master-cv-invitation";
import {
  SavedSearchesMenu,
  type SavedSearchOutcome,
} from "@/components/jobs/saved-searches-menu";
import { StartApplicationFlow } from "@/components/jobs/start-application-flow";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import {
  useCreateJobSearch,
  useDeleteJobSearch,
  useJobSearches,
  useUpdateJobSearch,
} from "@/hooks/use-job-searches";
import {
  apiStatus,
  jobApiDetail,
  useDismissJob,
  useJobs,
  useRestoreJob,
} from "@/hooks/use-jobs";
import { scrollIntoContainer } from "@/lib/scroll-into-container";
import { cn } from "@/lib/utils";
import type { JobSearch } from "@/services/types/job-searches";
import type { JobFilters, JobSummary } from "@/services/types/jobs";

/**
 * Filters and page live in the URL (Plan corrections 17): read through
 * `useSearchParams`, written through the History API, which Next keeps in
 * sync with `useSearchParams`. `router.replace` with only a new query is a
 * no-op on this static export.
 */
function writeJobsUrl(
  filters: JobFilters,
  page = 1,
  mode: "push" | "replace" = "push",
) {
  const query = filtersToSearchParams(filters, page).toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** A 4xx `detail` shows inline in the saved-search dialog; anything else is the menu's generic error. */
function savedSearchOutcome(error: unknown): SavedSearchOutcome {
  const status = apiStatus(error);
  const detail = jobApiDetail(error, "");
  if (status && status < 500 && detail) return detail;
  throw error;
}

export function JobsPage() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams],
  );
  const page = pageFromSearchParams(searchParams);

  const jobs = useJobs(filters, page);
  const baseCvs = useBaseCvs();
  const noMasterCv = baseCvs.isSuccess && baseCvs.data.length === 0;

  const dismiss = useDismissJob();
  const restore = useRestoreJob();
  const [marks, setMarks] = useState<Record<string, JobMarkPending>>({});

  const searches = useJobSearches();
  const createSearch = useCreateJobSearch();
  const updateSearch = useUpdateJobSearch();
  const deleteSearch = useDeleteJobSearch();

  const [starting, setStarting] = useState<JobSummary | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  const countRef = useRef<HTMLParagraphElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  const focusCountAfterDismiss = useRef(false);

  const data = jobs.data;
  const totalPages = data?.total_pages ?? 0;

  // An out-of-range `?page=` (a stale link, the last item dismissed) goes to the last page.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      writeJobsUrl(filters, totalPages, "replace");
    }
  }, [filters, page, totalPages]);

  // A dismissed job leaves the list and takes the focused button with it.
  useEffect(() => {
    if (!focusCountAfterDismiss.current) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      focusCountAfterDismiss.current = false;
      countRef.current?.focus({ preventScroll: true });
    }
  }, [data]);

  function setMark(id: string, mark: JobMarkPending) {
    setMarks((current) => {
      const next = { ...current };
      if (mark) next[id] = mark;
      else delete next[id];
      return next;
    });
  }

  function handleDismiss(job: JobSummary) {
    setMark(job.id, "dismiss");
    focusCountAfterDismiss.current = !filters.include_dismissed;
    dismiss.mutate(job.id, { onSettled: () => setMark(job.id, null) });
  }

  function handleRestore(job: JobSummary) {
    setMark(job.id, "restore");
    restore.mutate(job.id, { onSettled: () => setMark(job.id, null) });
  }

  function handlePageChange(next: number) {
    writeJobsUrl(filters, next);
    window.requestAnimationFrame(() => {
      if (listTopRef.current) scrollIntoContainer(listTopRef.current);
      countRef.current?.focus({ preventScroll: true });
    });
  }

  const activeSearchId =
    searches.data?.find((search) => sameJobFilters(search.filters, filters))
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight-display sm:text-3xl">
            {JOBS_COPY.title}
          </h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            {JOBS_COPY.subtitle}
          </p>
        </div>
        <SavedSearchesMenu
          searches={searches.data}
          isLoading={searches.isLoading}
          error={searches.isError ? jobApiDetail(searches.error) : null}
          onRetry={() => void searches.refetch()}
          activeId={activeSearchId}
          onApply={(search) =>
            writeJobsUrl(normalizeJobFilters(search.filters))
          }
          onSave={saveSearch}
          onRename={renameSearch}
          onDelete={removeSearch}
          className="w-full sm:w-auto"
        />
      </div>

      {noMasterCv ? <MasterCvInvitation /> : null}

      <div ref={listTopRef}>
        <JobFiltersToolbar
          value={filters}
          onChange={(next) => writeJobsUrl(next)}
          fitAvailable={!noMasterCv}
          summary={
            data ? <JobResultsCount ref={countRef} total={data.total} /> : null
          }
        />
      </div>

      {jobs.isError ? (
        <JobLoadError
          message={jobApiDetail(jobs.error, "Something went wrong")}
          onRetry={() => void jobs.refetch()}
          isRetrying={jobs.isFetching}
        />
      ) : !data ? (
        <JobListSkeleton />
      ) : data.total === 0 && !hasAnyJobFilter(filters) ? (
        <JobListEmpty />
      ) : data.total === 0 ? (
        <JobListNoMatches
          onClearFilters={() => writeJobsUrl(clearJobFilters(filters))}
        />
      ) : (
        <>
          <ul
            aria-busy={jobs.isPlaceholderData || undefined}
            data-slot="job-list"
            className={cn(
              "flex flex-col gap-3 transition-opacity",
              jobs.isPlaceholderData && "opacity-60",
            )}
          >
            {data.items.map((job) => (
              <li key={job.id} data-job-id={job.id}>
                <JobListItem
                  job={noMasterCv ? { ...job, best_fit: null } : job}
                  onStart={(target) => {
                    setStarting(target);
                    setStartOpen(true);
                  }}
                  onDismiss={handleDismiss}
                  onRestore={handleRestore}
                  pending={marks[job.id] ?? null}
                />
              </li>
            ))}
          </ul>
          <JobListPager
            page={Math.min(page, Math.max(1, data.total_pages))}
            totalPages={data.total_pages}
            onPageChange={handlePageChange}
          />
        </>
      )}

      <StartApplicationFlow
        key={starting?.id}
        job={starting}
        open={startOpen}
        onOpenChange={setStartOpen}
      />
    </div>
  );
}
