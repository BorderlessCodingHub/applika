"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react";

import { Button, LinkButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { FitBadge } from "@/components/jobs/fit-badge";
import {
  JOBS_COPY,
  jobApplicationHref,
  startDescription,
} from "@/components/jobs/job-copy";
import { preselectedBaseCvId } from "@/components/tailored-cvs/base-cv-picker";
import type {
  JobApplicationRef,
  JobSummary,
  JobTailoring,
} from "@/services/types/jobs";
import { cn } from "@/lib/utils";

const NO_CV = "none";

export interface StartApplicationCvOption {
  id: string;
  name: string;
  /** This CV's fit for the job (`JobDetail.fits`), when known. */
  fit?: number | null;
}

/** `base_cv_id: null` is "Without a CV"; `tailoring` is then always `"copy"`. */
export interface StartApplicationChoice {
  base_cv_id: string | null;
  tailoring: JobTailoring;
}

/** After a 409: the refetched job's `application`; `isLoading` while that refetch runs. */
export interface StartApplicationConflict {
  application: JobApplicationRef | null;
  isLoading?: boolean;
}

export interface StartApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Pick<JobSummary, "title" | "company_name"> | null;
  /** The user's master CVs. `[]` means none: the draft starts without a copy. */
  cvs: readonly StartApplicationCvOption[] | undefined;
  cvsLoading?: boolean;
  cvsError?: string | null;
  onRetryCvs?: () => void;
  /** The job has a non-blank description. `false` renders no "Tailor by keywords" at all (R-026). */
  canTailor: boolean;
  /** The job detail is still loading, so `canTailor` is not known yet. */
  tailorLoading?: boolean;
  onSubmit: (choice: StartApplicationChoice) => void;
  isPending?: boolean;
  /** The server's `detail` for a 404 or 422, shown inline. */
  error?: string | null;
  conflict?: StartApplicationConflict | null;
}

/**
 * R-020/R-021: pick a master CV (optional), copy it verbatim (preselected) or
 * tailor it by keywords, then "Create draft". After picking a CV the flow is
 * Start, "Tailor by keywords", "Create draft": three clicks.
 */
export function StartApplicationDialog({
  open,
  onOpenChange,
  isPending = false,
  ...props
}: StartApplicationDialogProps) {
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-slot="start-application-dialog"
        className="top-4 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 p-0 sm:top-[10dvh] sm:max-h-[80dvh] sm:max-w-lg"
        // Opened from a list button, not a DialogTrigger: Radix has nothing to return focus to.
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          openerRef.current =
            active instanceof HTMLElement && active !== document.body
              ? active
              : null;
        }}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          openerRef.current = null;
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
      >
        <DialogHeader className="border-b border-border/60 px-6 pt-6 pr-12 pb-4">
          <DialogTitle className="font-display">
            {JOBS_COPY.startTitle}
          </DialogTitle>
          {props.job ? (
            <DialogDescription className="text-pretty">
              {startDescription(props.job.title, props.job.company_name)}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <StartApplicationBody
          {...props}
          isPending={isPending}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function StartApplicationBody({
  cvs,
  cvsLoading = false,
  cvsError,
  onRetryCvs,
  canTailor,
  tailorLoading = false,
  onSubmit,
  isPending,
  error,
  conflict,
  onCancel,
}: Omit<StartApplicationDialogProps, "open" | "onOpenChange" | "job"> & {
  isPending: boolean;
  onCancel: () => void;
}) {
  const ids = {
    cvLegend: useId(),
    cvHint: useId(),
    copyLegend: useId(),
  };
  const errorRef = useRef<HTMLParagraphElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);

  // Lives inside DialogContent, so a closed dialog unmounts it and every open starts fresh.
  const [cvChoice, setCvChoice] = useState<string | null>(null);
  const [tailoringChoice, setTailoringChoice] = useState<JobTailoring>("copy");

  const options = cvs ?? [];
  const known =
    cvChoice === NO_CV || options.some((option) => option.id === cvChoice);
  const selectedCv =
    cvChoice !== null && known
      ? cvChoice
      : (preselectedBaseCvId(options) ?? NO_CV);
  const hasCv = selectedCv !== NO_CV;
  const tailoring: JobTailoring = hasCv && canTailor ? tailoringChoice : "copy";

  const hasConflict = conflict != null;
  useEffect(() => {
    if (hasConflict) conflictRef.current?.focus({ preventScroll: true });
  }, [hasConflict]);

  useEffect(() => {
    if (!error) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      errorRef.current?.focus({ preventScroll: true });
    }
  }, [error]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || cvsLoading) return;
    onSubmit({ base_cv_id: hasCv ? selectedCv : null, tailoring });
  }

  if (conflict) {
    const application = conflict.application;
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <div
            ref={conflictRef}
            role="alert"
            tabIndex={-1}
            data-slot="start-application-conflict"
            className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong px-4 py-4 outline-none"
          >
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
              <CircleAlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              {JOBS_COPY.alreadyApplied}
            </p>
            {conflict.isLoading ? (
              <Skeleton className="h-9 w-40" />
            ) : application ? (
              <LinkButton href={jobApplicationHref(application)}>
                {application.is_draft
                  ? JOBS_COPY.openDraft
                  : JOBS_COPY.openApplication}
                <ArrowRightIcon aria-hidden data-icon="inline-end" />
              </LinkButton>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end border-t border-border/60 px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            {JOBS_COPY.close}
          </Button>
        </div>
      </>
    );
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      data-slot="start-application-form"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-6 py-5">
        <fieldset disabled={isPending} className="min-w-0">
          <legend
            id={ids.cvLegend}
            className="mb-1 text-sm font-semibold text-foreground"
          >
            {JOBS_COPY.cvLegend}
          </legend>
          <p id={ids.cvHint} className="mb-3 text-xs text-muted-foreground">
            {JOBS_COPY.cvHint}
          </p>

          {cvsLoading ? (
            <div aria-hidden className="flex flex-col gap-2">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          ) : cvsError ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2.5">
              <p className="text-sm text-foreground/80">{cvsError}</p>
              {onRetryCvs ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetryCvs}
                >
                  <RotateCcwIcon aria-hidden data-icon="inline-start" />
                  {JOBS_COPY.retry}
                </Button>
              ) : null}
            </div>
          ) : options.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-foreground/80">
              {JOBS_COPY.noCvs}
            </p>
          ) : (
            <RadioGroup
              value={selectedCv}
              onValueChange={setCvChoice}
              aria-labelledby={ids.cvLegend}
              aria-describedby={ids.cvHint}
              className="gap-2"
            >
              {options.map((cv) => (
                <OptionRow
                  key={cv.id}
                  value={cv.id}
                  label={cv.name}
                  trailing={
                    cv.fit == null
                      ? undefined
                      : (id) => <FitBadge score={cv.fit ?? null} id={id} />
                  }
                />
              ))}
              <OptionRow
                value={NO_CV}
                label={JOBS_COPY.noCvOption}
                description={JOBS_COPY.noCvHint}
              />
            </RadioGroup>
          )}
        </fieldset>

        {hasCv ? (
          <fieldset
            disabled={isPending}
            data-slot="start-application-tailoring"
            className="min-w-0"
          >
            <legend
              id={ids.copyLegend}
              className="mb-3 text-sm font-semibold text-foreground"
            >
              {JOBS_COPY.copyLegend}
            </legend>
            <RadioGroup
              value={tailoring}
              onValueChange={(next) => setTailoringChoice(next as JobTailoring)}
              aria-labelledby={ids.copyLegend}
              className="gap-2"
            >
              <OptionRow
                value="copy"
                label={JOBS_COPY.verbatim}
                description={JOBS_COPY.verbatimHint}
              />
              {canTailor ? (
                <OptionRow
                  value="keywords"
                  label={JOBS_COPY.keywords}
                  description={JOBS_COPY.keywordsHint}
                />
              ) : tailorLoading ? (
                <Skeleton aria-hidden className="h-16 w-full rounded-lg" />
              ) : null}
            </RadioGroup>
          </fieldset>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-4">
        {error ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            data-slot="start-application-error"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground outline-none"
          >
            <CircleAlertIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            aria-disabled={isPending || undefined}
            onClick={() => {
              if (!isPending) onCancel();
            }}
          >
            {JOBS_COPY.cancel}
          </Button>
          <Button
            type="submit"
            aria-disabled={isPending || cvsLoading || undefined}
            aria-busy={isPending || undefined}
            data-pending={isPending ? "" : undefined}
            className="aria-disabled:opacity-60"
          >
            {isPending ? (
              <LoaderCircleIcon
                aria-hidden
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : null}
            {JOBS_COPY.create}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * One radio as a whole clickable row. The row is the `<label>`; the radio's
 * name is only `label` (`aria-labelledby`), the hint and fit describe it.
 */
function OptionRow({
  value,
  label,
  description,
  trailing,
}: {
  value: string;
  label: string;
  description?: string;
  trailing?: (id: string) => ReactNode;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const trailingId = useId();
  const describedBy =
    [description ? descriptionId : null, trailing ? trailingId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <label
      data-slot="start-application-option"
      data-value={value}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-border-strong",
        "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
      )}
    >
      <RadioGroupItem
        value={value}
        aria-labelledby={nameId}
        aria-describedby={describedBy}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span
          id={nameId}
          className="block text-sm font-medium break-words text-foreground"
        >
          {label}
        </span>
        {description ? (
          <span
            id={descriptionId}
            className="mt-0.5 block text-xs text-pretty text-muted-foreground"
          >
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? trailing(trailingId) : null}
    </label>
  );
}
