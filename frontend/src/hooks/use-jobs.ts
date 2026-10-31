"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { isAxiosError, type AxiosError } from "axios";
import { toast } from "sonner";

import { localCalendarDay } from "@/components/application-drafts/draft-copy";
import { APPLICATION_DRAFTS_QUERY_KEY } from "@/hooks/use-application-drafts";
import { getApiError } from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/api-error-message";
import { services } from "@/services/services";
import type {
  DraftFromJobInput,
  JobDetail,
  JobFilters,
  JobPage,
} from "@/services/types/jobs";

/**
 * Job board hooks (PRD 0012), ported from Ían Muliterno's `use-jobs.ts`.
 * The filters are NOT state here: the page reads them from the URL.
 */

/** Root key of every job list page: `["jobs", filters, page]`. */
export const JOBS_QUERY_KEY = ["jobs"] as const;
/** Root key of every job detail: `["job", id]`. */
export const JOB_QUERY_KEY = ["job"] as const;

export function jobQueryKey(id: string | null | undefined) {
  return [...JOB_QUERY_KEY, id] as const;
}

export function useJobs(filters: JobFilters, page: number) {
  return useQuery({
    queryKey: [...JOBS_QUERY_KEY, filters, page],
    queryFn: () => services.jobs.list(filters, page),
    // A filter change keeps the old page on screen until the new one lands.
    placeholderData: keepPreviousData,
  });
}

/** One job. A 404 is "no longer listed", not a failure to retry. */
export function useJob(id: string | null | undefined) {
  return useQuery({
    queryKey: jobQueryKey(id),
    queryFn: () => services.jobs.get(id as string),
    enabled: Boolean(id),
  });
}

/** The error's words by code, else its string `detail`, else `fallback` (`lib/api-error-message.ts`). */
export function jobApiDetail(
  error: unknown,
  fallback = "Something went wrong. Try again.",
): string {
  if (!isAxiosError(error)) return fallback;
  return apiErrorMessage(error.response?.data, fallback);
}

export function apiStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

type JobsSnapshot = [readonly unknown[], JobPage | undefined][];
type MarkContext = {
  pages: JobsSnapshot;
  detail: JobDetail | undefined;
};

/**
 * Optimistic mark: the list reflects it at once. A list WITHOUT dismissed
 * jobs drops a dismissed one (R-029: "it leaves their list"); a "Show
 * dismissed" list keeps it, marked.
 */
async function applyMark(
  queryClient: QueryClient,
  id: string,
  dismissed: boolean,
): Promise<MarkContext> {
  await queryClient.cancelQueries({ queryKey: JOBS_QUERY_KEY });
  await queryClient.cancelQueries({ queryKey: jobQueryKey(id) });
  const pages = queryClient.getQueriesData<JobPage>({
    queryKey: JOBS_QUERY_KEY,
  });
  const detail = queryClient.getQueryData<JobDetail>(jobQueryKey(id));

  for (const [key, page] of pages) {
    if (!page) continue;
    const filters = key[1] as JobFilters | undefined;
    if (!page.items.some((job) => job.id === id)) continue;
    const next: JobPage =
      dismissed && !filters?.include_dismissed
        ? {
            ...page,
            items: page.items.filter((job) => job.id !== id),
            total: Math.max(0, page.total - 1),
          }
        : {
            ...page,
            items: page.items.map((job) =>
              job.id === id ? { ...job, dismissed } : job,
            ),
          };
    queryClient.setQueryData(key, next);
  }
  if (detail) {
    queryClient.setQueryData(jobQueryKey(id), { ...detail, dismissed });
  }
  return { pages, detail };
}

function rollback(
  queryClient: QueryClient,
  id: string,
  context: MarkContext | undefined,
) {
  if (!context) return;
  for (const [key, page] of context.pages) queryClient.setQueryData(key, page);
  if (context.detail) {
    queryClient.setQueryData(jobQueryKey(id), context.detail);
  }
}

function useJobMark(dismissed: boolean) {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError, string, MarkContext>({
    mutationFn: (id) =>
      dismissed ? services.jobs.dismiss(id) : services.jobs.restore(id),
    onMutate: (id) => applyMark(queryClient, id, dismissed),
    onError: (error, id, context) => {
      rollback(queryClient, id, context);
      toast.error(getApiError(error));
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: jobQueryKey(id) });
    },
  });
}

/** `PUT /jobs/{id}/dismissal`: the job leaves the list until restored (R-029). */
export function useDismissJob() {
  return useJobMark(true);
}

/** `DELETE /jobs/{id}/dismissal`. */
export function useRestoreJob() {
  return useJobMark(false);
}

/**
 * `POST /applications/drafts/from-job` (R-020/R-021). No toast: the start
 * dialog shows a 404/422 `detail` inline and turns a 409 into "Open draft".
 * Always sends the user's LOCAL day as `application_date` (KODI-050): the
 * server's UTC day is yesterday or tomorrow for part of the world, and Finish
 * refused a draft dated "tomorrow" as in the future.
 */
export function useStartApplicationFromJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<DraftFromJobInput, "application_date">) =>
      services.applicationDrafts.createFromJob({
        ...data,
        application_date: localCalendarDay(),
      }),
    // Not awaited: the page navigates away at once, nothing here waits on the refetch.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: JOB_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: APPLICATION_DRAFTS_QUERY_KEY,
      });
    },
  });
}
