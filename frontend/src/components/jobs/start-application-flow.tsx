"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  StartApplicationDialog,
  type StartApplicationChoice,
  type StartApplicationConflict,
} from "@/components/jobs/start-application-dialog";
import { isBlankDescription } from "@/components/jobs/job-copy";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import {
  apiStatus,
  jobApiDetail,
  useJob,
  useStartApplicationFromJob,
} from "@/hooks/use-jobs";
import type { DraftFromJobInput, JobSummary } from "@/services/types/jobs";

/** Where a new draft lands: the CV step of "new application with CV" (R-020, Plan corrections 19). */
export function draftCvStepHref(draftId: string): string {
  return `/applications/new-with-cv?id=${encodeURIComponent(draftId)}&step=cv`;
}

/** What the dialog sends: no CV omits both `base_cv_id` and `tailoring`. */
export function draftFromJobPayload(
  jobId: string,
  choice: StartApplicationChoice,
): DraftFromJobInput {
  return choice.base_cv_id
    ? {
        job_id: jobId,
        base_cv_id: choice.base_cv_id,
        tailoring: choice.tailoring,
      }
    : { job_id: jobId };
}

export interface StartApplicationFlowProps {
  /** The job being started; the dialog is open while this is set and `open` is true. */
  job: Pick<JobSummary, "id" | "title" | "company_name"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The data half of `StartApplicationDialog`, shared by /jobs and
 * /jobs/view: the master CVs, the job's detail (its description decides
 * whether "Tailor by keywords" exists, its `fits` label each CV), the
 * create call, and the 409 turn into "Open draft" / "Open application"
 * (Plan corrections 6).
 */
export function StartApplicationFlow({
  job,
  open,
  onOpenChange,
}: StartApplicationFlowProps) {
  const router = useRouter();
  const baseCvs = useBaseCvs();
  const detail = useJob(job?.id);
  const start = useStartApplicationFromJob();
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<StartApplicationConflict | null>(
    null,
  );
  const [navigating, setNavigating] = useState(false);

  const fits = detail.data?.fits ?? [];
  const cvs = baseCvs.data?.map((cv) => ({
    id: cv.id,
    name: cv.name,
    fit: fits.find((fit) => fit.base_cv_id === cv.id)?.score ?? null,
  }));

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null);
      setConflict(null);
      start.reset();
    }
    onOpenChange(next);
  }

  function submit(choice: StartApplicationChoice) {
    if (!job) return;
    setError(null);
    start.mutate(draftFromJobPayload(job.id, choice), {
      onSuccess: (draft) => {
        // The dialog stays open, pending, until the next page takes over.
        setNavigating(true);
        router.push(draftCvStepHref(draft.id));
      },
      onError: async (failure) => {
        if (apiStatus(failure) !== 409) {
          setError(jobApiDetail(failure));
          return;
        }
        setConflict({ application: null, isLoading: true });
        const refetched = await detail.refetch();
        const application = refetched.data?.application ?? null;
        if (application) {
          setConflict({ application });
        } else {
          setConflict(null);
          setError(jobApiDetail(failure));
        }
      },
    });
  }

  return (
    <StartApplicationDialog
      open={open && job !== null}
      onOpenChange={handleOpenChange}
      job={job}
      cvs={cvs}
      cvsLoading={baseCvs.isLoading}
      cvsError={baseCvs.isError ? jobApiDetail(baseCvs.error) : null}
      onRetryCvs={() => void baseCvs.refetch()}
      canTailor={
        detail.data ? !isBlankDescription(detail.data.description_text) : false
      }
      tailorLoading={detail.isLoading}
      onSubmit={submit}
      isPending={start.isPending || navigating}
      error={error}
      conflict={conflict}
    />
  );
}
