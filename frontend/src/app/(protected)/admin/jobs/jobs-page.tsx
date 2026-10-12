"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { AxiosError } from "axios";
import { toast } from "sonner";

import {
  JobSourcesHeader,
  type JobRunNotice,
} from "@/components/admin/job-run-controls";
import { JOB_SOURCES_COPY } from "@/components/admin/job-sources-copy";
import {
  JobSourcesTable,
  type JobSourceRow,
} from "@/components/admin/job-sources-table";
import {
  useAdminJobSources,
  useStartJobRun,
  useUpdateAdminJobSource,
} from "@/hooks/use-admin";

/** After a 202 the list refetches every 3 s for at most 60 s: the API has no "running" state. */
export const JOB_RUN_POLL_INTERVAL_MS = 3_000;
export const JOB_RUN_POLL_WINDOW_MS = 60_000;

/** The server's string `detail`, or `null` (a 5xx body, a network error). */
function serverDetail(error: AxiosError): string | null {
  const detail = (error.response?.data as { detail?: unknown } | undefined)
    ?.detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

/**
 * Admin job sources (KODI-049, R-033..R-035). Pattern:
 * `admin/discord-webhooks/discord-webhooks-page.tsx`. The header, the notice
 * and the table are ui-designer components (`job-run-controls.tsx`,
 * `job-sources-table.tsx`); this component owns the query, the optimistic
 * on/off PATCH and the run start.
 */
export function JobsPage() {
  const [polling, setPolling] = useState(false);
  const {
    data: sources,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useAdminJobSources({
    refetchInterval: polling ? JOB_RUN_POLL_INTERVAL_MS : false,
  });
  const updateMutation = useUpdateAdminJobSource();
  const runMutation = useStartJobRun();

  const [notice, setNotice] = useState<JobRunNotice | null>(null);
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!polling) return;
    const timer = window.setTimeout(
      () => setPolling(false),
      JOB_RUN_POLL_WINDOW_MS,
    );
    return () => window.clearTimeout(timer);
  }, [polling]);

  const handleRunNow = useCallback(() => {
    // Cleared first: the same words twice in a row are otherwise not re-announced.
    setNotice(null);
    runMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(JOB_SOURCES_COPY.runStarted);
        setPolling(true);
      },
      onError: (error) => {
        setNotice({
          tone: error.response?.status === 409 ? "info" : "error",
          message: serverDetail(error) ?? JOB_SOURCES_COPY.runFailed,
        });
      },
    });
  }, [runMutation]);

  const handleEnabledChange = useCallback(
    (source: JobSourceRow, enabled: boolean) => {
      if (pendingIds.includes(source.id)) return;
      setPendingIds((ids) => [...ids, source.id]);
      updateMutation.mutate(
        { id: source.id, is_enabled: enabled },
        {
          onSettled: () =>
            setPendingIds((ids) => ids.filter((id) => id !== source.id)),
        },
      );
    },
    [pendingIds, updateMutation],
  );

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <JobSourcesHeader
          onRunNow={handleRunNow}
          isStartingRun={runMutation.isPending}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
        />
      </motion.div>

      <JobSourcesTable
        sources={sources}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        isRetrying={isError && isFetching}
        isRefreshing={isFetching && !isLoading && !isError}
        onEnabledChange={handleEnabledChange}
        pendingIds={pendingIds}
      />
    </div>
  );
}
