"use client";

import { useEffect, useRef, useState } from "react";

import { JobFiltersToolbar } from "@/components/jobs/job-filters";
import {
  useJobsCopy,
  clearJobFilters,
  hasAnyJobFilter,
} from "@/components/jobs/job-copy";
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
import { SavedSearchesMenu } from "@/components/jobs/saved-searches-menu";
import { StartApplicationFlow } from "@/components/jobs/start-application-flow";
import {
  useSavedSearchesMenu,
  useUrlJobFilters,
  writeJobsUrl,
} from "@/components/jobs/use-job-board";
import { BetaBadge } from "@/components/features/beta-badge";
import { FeatureGate } from "@/components/features/feature-gate";
import { JobsScreen } from "@/components/phone/screens/jobs-screen";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useHasFeature } from "@/hooks/use-features";
import { useIsPhone } from "@/hooks/use-is-phone";
import {
  jobApiDetail,
  useDismissJob,
  useJobs,
  useRestoreJob,
} from "@/hooks/use-jobs";
import { unknownErrorMessage } from "@/lib/api-error-message";
import { scrollIntoContainer } from "@/lib/scroll-into-container";
import { cn } from "@/lib/utils";
import type { JobSummary } from "@/services/types/jobs";

/**
 * `/jobs` behind the `jobs` feature (PRD 0013): without it, the app's "page
 * not found" and not one job request — the gate sits above every job hook.
 * Below md the v2/Jobs board (PRD 0021), inside the same gate; at md and up
 * today's board, unchanged.
 */
export function JobsPage() {
  const isPhone = useIsPhone();
  return (
    <FeatureGate feature="jobs">
      {isPhone ? <JobsScreen /> : <JobBoard />}
    </FeatureGate>
  );
}

function JobBoard() {
  const copy = useJobsCopy();
  const beta = useHasFeature("jobs").stage === "beta";
  const hasCvs = useHasFeature("cvs").has;
  const { filters, page } = useUrlJobFilters(hasCvs);

  const jobs = useJobs(filters, page);
  const baseCvs = useBaseCvs();
  const noMasterCv = hasCvs && baseCvs.isSuccess && baseCvs.data.length === 0;

  const dismiss = useDismissJob();
  const restore = useRestoreJob();
  const [marks, setMarks] = useState<Record<string, JobMarkPending>>({});

  const savedSearchesMenu = useSavedSearchesMenu(filters, hasCvs);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight-display sm:text-3xl">
              {copy.title}
            </h1>
            {beta ? <BetaBadge /> : null}
          </div>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            {hasCvs ? copy.subtitle : copy.subtitleNoCvs}
          </p>
        </div>
        <SavedSearchesMenu
          {...savedSearchesMenu}
          className="w-full sm:w-auto"
        />
      </div>

      {noMasterCv ? <MasterCvInvitation /> : null}

      <div ref={listTopRef}>
        <JobFiltersToolbar
          value={filters}
          onChange={(next) => writeJobsUrl(next)}
          fitAvailable={!noMasterCv}
          showFit={hasCvs}
          summary={
            data ? <JobResultsCount ref={countRef} total={data.total} /> : null
          }
        />
      </div>

      {jobs.isError ? (
        <JobLoadError
          message={jobApiDetail(jobs.error, unknownErrorMessage())}
          onRetry={() => void jobs.refetch()}
          isRetrying={jobs.isFetching}
        />
      ) : !data ? (
        <JobListSkeleton />
      ) : data.total === 0 && !hasAnyJobFilter(filters) ? (
        <JobListEmpty />
      ) : data.total === 0 ? (
        <JobListNoMatches
          showFit={hasCvs}
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
                  job={noMasterCv || !hasCvs ? { ...job, best_fit: null } : job}
                  onStart={
                    hasCvs
                      ? (target) => {
                          setStarting(target);
                          setStartOpen(true);
                        }
                      : undefined
                  }
                  linkDraft={hasCvs}
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

      {hasCvs ? (
        <StartApplicationFlow
          key={starting?.id}
          job={starting}
          open={startOpen}
          onOpenChange={setStartOpen}
        />
      ) : null}
    </div>
  );
}
