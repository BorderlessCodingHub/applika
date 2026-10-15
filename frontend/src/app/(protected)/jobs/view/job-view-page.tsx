"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  JobDetailBackLink,
  JobDetailSkeleton,
  JobDetailView,
  JobNotListed,
} from "@/components/jobs/job-detail-view";
import { JOBS_COPY } from "@/components/jobs/job-copy";
import type { JobMarkPending } from "@/components/jobs/job-list-item";
import { JobLoadError } from "@/components/jobs/job-list-states";
import { StartApplicationFlow } from "@/components/jobs/start-application-flow";
import { BetaBadge } from "@/components/features/beta-badge";
import { FeatureGate } from "@/components/features/feature-gate";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useHasFeature } from "@/hooks/use-features";
import {
  apiStatus,
  jobApiDetail,
  useDismissJob,
  useJob,
  useRestoreJob,
} from "@/hooks/use-jobs";

/**
 * `/jobs/view?id=` (R-012): the description, the link to the source, and
 * each master CV's fit. A 404 (unknown, or no longer listed without an
 * application of the user's) is "This job is no longer listed".
 */
export function JobViewPage() {
  return (
    <FeatureGate feature="jobs">
      <JobView />
    </FeatureGate>
  );
}

/** Mounted only with `jobs` (PRD 0013), so `useJob` never fires without it. */
function JobView() {
  const beta = useHasFeature("jobs").stage === "beta";
  const id = useSearchParams().get("id");
  const job = useJob(id);
  const baseCvs = useBaseCvs();
  const dismiss = useDismissJob();
  const restore = useRestoreJob();
  const [startOpen, setStartOpen] = useState(false);

  if (!id || apiStatus(job.error) === 404) return <JobNotListed />;
  if (job.isLoading) return <JobDetailSkeleton />;
  if (job.isError || !job.data) {
    return (
      <div className="flex flex-col gap-6">
        <JobDetailBackLink />
        <JobLoadError
          titleAs="h1"
          title={JOBS_COPY.loadJobErrorTitle}
          message={jobApiDetail(job.error, "Something went wrong")}
          onRetry={() => void job.refetch()}
          isRetrying={job.isFetching}
        />
      </div>
    );
  }

  const pending: JobMarkPending = dismiss.isPending
    ? "dismiss"
    : restore.isPending
      ? "restore"
      : null;

  return (
    <>
      <JobDetailView
        job={job.data}
        cvs={baseCvs.data}
        cvsLoading={baseCvs.isLoading}
        onStart={() => setStartOpen(true)}
        onDismiss={(target) => dismiss.mutate(target.id)}
        onRestore={(target) => restore.mutate(target.id)}
        pending={pending}
        titleBadge={beta ? <BetaBadge /> : undefined}
      />
      <StartApplicationFlow
        job={job.data}
        open={startOpen}
        onOpenChange={setStartOpen}
      />
    </>
  );
}
