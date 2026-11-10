"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, Loader2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  clampFit,
  jobApplicationHref,
  startDescription,
} from "@/components/jobs/job-copy";
import type {
  StartApplicationChoice,
  StartApplicationConflict,
  StartApplicationCvOption,
} from "@/components/jobs/start-application-dialog";
import {
  useStartApplicationFlow,
  type StartApplicationFlowProps,
} from "@/components/jobs/start-application-flow";
import { PhoneLoadError } from "@/components/phone/phone-load";
import { PhoneOption, PhoneOptionGroup } from "@/components/phone/phone-option";
import {
  PhoneSheetClose,
  PhoneSheetDescription,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "@/components/phone/phone-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { preselectedBaseCvId } from "@/components/tailored-cvs/base-cv-picker";
import type { JobSummary, JobTailoring } from "@/services/types/jobs";

const NO_CV = "none";

export interface StartApplicationSheetCv extends StartApplicationCvOption {
  /** The master CV's `updated_at`: the board's "updated Oct 30". */
  updatedAt?: string | null;
}

/**
 * The same props as today's `StartApplicationDialog` (so `StartApplicationFlow`'s
 * data feeds either), plus each CV's last update for the board's hint.
 */
export interface StartApplicationSheetViewProps {
  open: boolean;
  /** Closing is ignored while `isPending`, as today's dialog does. */
  onOpenChange: (open: boolean) => void;
  /** Read as the sheet's description (visually hidden: the board draws none). */
  job: Pick<JobSummary, "title" | "company_name"> | null;
  /** `[]`: no master CV, the draft starts without a copy. */
  cvs: readonly StartApplicationSheetCv[] | undefined;
  cvsLoading?: boolean;
  cvsError?: string | null;
  onRetryCvs?: () => void;
  /** A non-blank description: "Tailor by keywords" exists. `false` renders none (R-026). */
  canTailor: boolean;
  /** The detail is loading, `canTailor` not known yet. */
  tailorLoading?: boolean;
  onSubmit: (choice: StartApplicationChoice) => void;
  /** The create is in flight, or the next page is loading. */
  isPending?: boolean;
  /** The 404/422 `detail`, inline above the buttons. */
  error?: string | null;
  /** After a 409: the existing application or draft to open. */
  conflict?: StartApplicationConflict | null;
}

/** v2/StartApplication below md, on the phone sheet: props in, the board out. */
export function StartApplicationSheetView({
  open,
  onOpenChange,
  isPending = false,
  job,
  ...props
}: StartApplicationSheetViewProps) {
  const t = useTranslations("jobs");
  const tCommon = useTranslations("common");

  return (
    <PhoneSheetFrame
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
      described={job !== null}
    >
      <span className="ph-grab" aria-hidden="true" />
      <div className="ph-sa-head">
        <PhoneSheetTitle className="ph-sa-title">
          {t("startTitle")}
        </PhoneSheetTitle>
        <PhoneSheetClose
          aria-label={tCommon("close")}
          aria-disabled={isPending || undefined}
          className="ph-sa-close"
          onClick={(event) => {
            if (isPending) event.preventDefault();
          }}
        >
          <X size={20} aria-hidden="true" />
        </PhoneSheetClose>
      </div>
      {job ? (
        <PhoneSheetDescription className="ph-sr">
          {startDescription(job.title, job.company_name)}
        </PhoneSheetDescription>
      ) : null}
      <StartApplicationBody
        {...props}
        isPending={isPending}
        onCancel={() => onOpenChange(false)}
      />
    </PhoneSheetFrame>
  );
}

/** Mounted inside the open sheet only, so every open starts fresh (today's dialog body). */
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
}: Omit<StartApplicationSheetViewProps, "open" | "onOpenChange" | "job"> & {
  isPending: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("jobs");
  const tPhone = useTranslations("phone.startApplication");
  const tCard = useTranslations("cvs.card");
  const format = useFormatter();
  const base = useId();
  const cvLegendId = `${base}-cv`;
  const copyLegendId = `${base}-copy`;
  const formId = `${base}-form`;
  const errorRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
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
  const locked = isPending || cvsLoading;

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
    if (locked) return;
    onSubmit({ base_cv_id: hasCv ? selectedCv : null, tailoring });
  }

  function cvHint(cv: StartApplicationSheetCv): string | undefined {
    const updated = cv.updatedAt ? new Date(cv.updatedAt) : null;
    const day =
      updated && !Number.isNaN(updated.getTime())
        ? format.dateTime(updated, { month: "short", day: "numeric" })
        : null;
    if (cv.fit != null && day) {
      return tPhone("cvHint", { score: clampFit(cv.fit), date: day });
    }
    if (cv.fit != null) return t("fitLabel", { score: clampFit(cv.fit) });
    if (day) return tCard("updated", { date: day });
    return undefined;
  }

  if (conflict) {
    const application = conflict.application;
    return (
      <>
        <div className="ph-scroll ph-sheet-body">
          <div
            ref={conflictRef}
            role="alert"
            tabIndex={-1}
            data-slot="start-application-conflict"
            className="ph-sa-conflict"
          >
            <p className="ph-sa-conflict-h">
              <CircleAlert size={16} aria-hidden="true" />
              {t("alreadyApplied")}
            </p>
            {conflict.isLoading ? (
              <Skeleton className="h-11 w-40 rounded-xl" />
            ) : application ? (
              <Link
                href={jobApplicationHref(application)}
                data-action="open-existing"
                className="ph-btn ph-sm ph-pri"
              >
                {application.is_draft ? t("openDraft") : t("openApplication")}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="ph-sheet-actions ph-sheet-foot">
          <button type="button" className="ph-btn ph-sec" onClick={onCancel}>
            {t("close")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <form
        id={formId}
        noValidate
        data-slot="start-application-form"
        className="ph-scroll ph-sheet-body"
        onSubmit={submit}
      >
        <fieldset className="ph-sa-fieldset">
          <legend id={cvLegendId} className="ph-lbl ph-sa-legend">
            {t("cvLegend")}
          </legend>
          <p className="ph-hint ph-sa-hint">{t("cvHint")}</p>
          {cvsLoading ? (
            <div aria-hidden="true" className="flex flex-col gap-2">
              <Skeleton className="h-[66px] w-full rounded-2xl" />
              <Skeleton className="h-[66px] w-full rounded-2xl" />
            </div>
          ) : cvsError ? (
            <PhoneLoadError
              message={cvsError}
              onRetry={() => onRetryCvs?.()}
              className="ph-sa-error-card"
            />
          ) : options.length === 0 ? (
            <p className="ph-hint ph-sa-none">{t("noCvs")}</p>
          ) : (
            <PhoneOptionGroup
              labelledBy={cvLegendId}
              value={selectedCv}
              onValueChange={setCvChoice}
              disabled={isPending}
            >
              {options.map((cv) => (
                <PhoneOption
                  key={cv.id}
                  value={cv.id}
                  title={cv.name}
                  hint={cvHint(cv)}
                />
              ))}
              <PhoneOption
                value={NO_CV}
                title={t("noCvOption")}
                hint={t("noCvHint")}
              />
            </PhoneOptionGroup>
          )}
        </fieldset>

        {hasCv ? (
          <fieldset
            data-slot="start-application-tailoring"
            className="ph-sa-fieldset"
          >
            <legend id={copyLegendId} className="ph-lbl ph-sa-legend">
              {t("copyLegend")}
            </legend>
            <PhoneOptionGroup
              labelledBy={copyLegendId}
              value={tailoring}
              onValueChange={(next) => setTailoringChoice(next as JobTailoring)}
              disabled={isPending}
            >
              <PhoneOption
                value="copy"
                title={t("verbatim")}
                hint={t("verbatimHint")}
              />
              {canTailor ? (
                <PhoneOption
                  value="keywords"
                  title={t("keywords")}
                  hint={tPhone("keywordsHint")}
                />
              ) : null}
            </PhoneOptionGroup>
            {!canTailor && tailorLoading ? (
              <Skeleton
                aria-hidden="true"
                className="h-[86px] w-full rounded-2xl"
              />
            ) : null}
          </fieldset>
        ) : null}
      </form>

      {error ? (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          data-slot="start-application-error"
          data-tone="error"
          className="ph-notice ph-sa-alert"
        >
          <CircleAlert size={16} aria-hidden="true" className="ph-notice-ic" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="ph-sheet-actions ph-sheet-foot">
        {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
        <button
          type="button"
          aria-disabled={isPending || undefined}
          data-disabled={isPending || undefined}
          className="ph-btn ph-sec"
          onClick={() => {
            if (!isPending) onCancel();
          }}
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          form={formId}
          aria-disabled={locked || undefined}
          aria-busy={isPending || undefined}
          data-disabled={locked || undefined}
          data-action="create-draft"
          className="ph-btn ph-pri"
          onClick={(event) => {
            if (locked) event.preventDefault();
          }}
        >
          {isPending ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {t("create")}
        </button>
      </div>
    </>
  );
}

/** The sheet on today's start flow (`useStartApplicationFlow`): the desktop dialog's data, calls and 409 path. */
export function StartApplicationSheet(props: StartApplicationFlowProps) {
  return <StartApplicationSheetView {...useStartApplicationFlow(props)} />;
}
