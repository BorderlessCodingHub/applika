"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AxiosError } from "axios";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import { ExportCvButton } from "@/components/base-cvs/export-cv-button";
import type { BaseCv, CvFormValues } from "@/components/base-cvs/types";
import { FullWidthContent } from "@/components/layout/content-width";
import { BaseCvPicker } from "@/components/tailored-cvs/base-cv-picker";
import { CvDiffDownloadRow } from "@/components/tailored-cvs/cv-diff-download-row";
import { CvFitPanel } from "@/components/tailored-cvs/cv-fit-panel";
import type { CvDiffSnapshot } from "@/components/tailored-cvs/cv-diff";
import { TailoredCvEditor } from "@/components/tailored-cvs/tailored-cv-editor";
import {
  emptyTailoredCvValues,
  sectionErrorMessage,
  tailoredCvSchema,
  tailoredCvToFormValues,
  toTailoredCvPayload,
} from "@/components/tailored-cvs/tailored-cv-schema";
import type { TailoredCvReadOnlyReason } from "@/components/tailored-cvs/types";
import { useCvDiff } from "@/components/tailored-cvs/use-cv-diff";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCycleContext } from "@/contexts/cycle-context";
import { useApplicationCvFit } from "@/hooks/use-application-cv-fit";
import { useHasFeature } from "@/hooks/use-features";
import { useApplicationById } from "@/hooks/use-applications";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useCreateTailoredCv } from "@/hooks/use-create-tailored-cv";
import { useDeleteBaseCv } from "@/hooks/use-delete-base-cv";
import { useDeleteTailoredCv } from "@/hooks/use-delete-tailored-cv";
import { useExportBaseCvMarkdown } from "@/hooks/use-export-base-cv-markdown";
import { useExportBaseCvPdf } from "@/hooks/use-export-base-cv-pdf";
import {
  useExportCvDiffMarkdown,
  useExportCvDiffPdf,
} from "@/hooks/use-export-cv-diff";
import { useExportTailoredCvMarkdown } from "@/hooks/use-export-tailored-cv-markdown";
import { useExportTailoredCvPdf } from "@/hooks/use-export-tailored-cv-pdf";
import { isNoTailoredCv, useTailoredCv } from "@/hooks/use-tailored-cv";
import { useUpdateTailoredCv } from "@/hooks/use-update-tailored-cv";
import { getApiError } from "@/lib/api-client";

function PageMessage({
  title,
  body,
  alert,
}: {
  title: string;
  body: string;
  /** Announce it. Only for something that WENT WRONG, never for a static state. */
  alert?: boolean;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="rounded-xl border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-pretty text-muted-foreground">
        {body}
      </p>
      <LinkButton
        href="/applications"
        variant="outline"
        size="sm"
        className="mt-4"
      >
        Back to applications
      </LinkButton>
    </div>
  );
}

/**
 * `/applications/cv?id=` — the application's CV copy.
 *
 * Two surfaces behind one route, chosen by whether the copy exists: the picker
 * while it does not, the editor once it does. There is NO default master CV —
 * the choice is made here, per application, every time — and a 404 from
 * `GET /applications/{id}/cv` is the ordinary "not picked yet" answer, not a
 * failure.
 *
 * This component owns everything stateful: the form and its schema, the
 * selected master CV, the read-only derivation and the return to the picker
 * after a delete. The picker and the editor are presentational.
 *
 * Read-only is a courtesy, not the rule. The SERVER refuses a write to a
 * finalized (409) or archived (422) application whatever the UI shows, and both
 * answers reach the user as the server's own `detail` in a toast. What the page
 * adds is that the user is told BEFORE typing, and that viewing and reading the
 * copy keep working — `GET` carries no such guard.
 *
 * The PDF export is on the readable side of that line. It is passed as the
 * editor's `actions` in BOTH modes and is never disabled by `readOnlyReason`
 * nor by a deleted source master CV: a finalized application's copy is exactly
 * the one a user needs to download.
 */
export function ApplicationCvPage() {
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("id");
  const { selectedCycleId, isViewingPastCycle } = useCycleContext();

  const {
    application,
    isLoading: applicationLoading,
    error: applicationError,
  } = useApplicationById(applicationId, selectedCycleId);

  const {
    data: cv,
    isLoading: cvLoading,
    error: cvError,
  } = useTailoredCv(applicationId);
  const baseCvs = useBaseCvs();

  const [selectedBaseCvId, setSelectedBaseCvId] = useState<string | null>(null);
  /** "Tailor by keywords" (R-026): off by default, back off after every create. */
  const [tailorByKeywords, setTailorByKeywords] = useState(false);
  const [deletingBaseCvId, setDeletingBaseCvId] = useState<string | null>(null);
  const [exportingBaseCvId, setExportingBaseCvId] = useState<string | null>(
    null,
  );
  const [exportingBaseCvMarkdownId, setExportingBaseCvMarkdownId] = useState<
    string | null
  >(null);
  const [editingApplication, setEditingApplication] = useState(false);
  /** Set on a 409/unresolvable baseline from the diff download routes; cleared on retry. */
  const [diffDownloadError, setDiffDownloadError] = useState<string | null>(
    null,
  );
  /**
   * The copy was deleted in this session. The query is invalidated at the same
   * moment, but a refetch is not instant: without this the editor would flash
   * back on screen with the copy the user just deleted before the 404 lands.
   * Cleared as soon as a new copy is created (AC7).
   */
  const [copyDeleted, setCopyDeleted] = useState(false);

  const form = useForm<CvFormValues>({
    resolver: zodResolver(tailoredCvSchema),
    defaultValues: emptyTailoredCvValues(),
  });

  // Seeded ONCE per copy: a later refetch (every save invalidates the key and
  // triggers one) must never stomp what the user is typing. Seeding from the
  // server response is also what round-trips the client-generated section item
  // ids — they are never regenerated on load.
  const seededId = useRef<string | null>(null);
  useEffect(() => {
    if (!cv || seededId.current === cv.id) return;
    seededId.current = cv.id;
    form.reset(tailoredCvToFormValues(cv));
  }, [cv, form]);

  const createMutation = useCreateTailoredCv(applicationId ?? "", {
    onSuccess: () => {
      setCopyDeleted(false);
      setTailorByKeywords(false);
    },
  });
  const updateMutation = useUpdateTailoredCv(applicationId ?? "");
  const deleteMutation = useDeleteTailoredCv(applicationId ?? "", {
    onSuccess: () => {
      seededId.current = null;
      setSelectedBaseCvId(null);
      setCopyDeleted(true);
      form.reset(emptyTailoredCvValues());
    },
  });

  // Named from the SERVER's copy, never from the form: the fallback filename
  // has to match the document the server renders, not the unsaved edits.
  const exportMutation = useExportTailoredCvPdf(
    applicationId ?? "",
    cv?.name ?? "",
  );
  const exportMarkdownMutation = useExportTailoredCvMarkdown(
    applicationId ?? "",
    cv?.name ?? "",
  );

  // The diff downloads (KODI-017 part 3): the SAVED copy vs. its baseline,
  // rendered by the server. A 409 (no baseline) or any other failure sets
  // `diffDownloadError`, which disables the row with the server's own reason.
  const exportDiffMarkdownMutation = useExportCvDiffMarkdown(
    applicationId ?? "",
    cv?.name ?? "",
    { onNoBaseline: setDiffDownloadError },
  );
  const exportDiffPdfMutation = useExportCvDiffPdf(
    applicationId ?? "",
    cv?.name ?? "",
    { onNoBaseline: setDiffDownloadError },
  );

  // Master CV delete/export for the picker (KODI-017), the same pattern
  // `cvs-page.tsx` uses — named distinctly from the tailored-CV `exportMutation`
  // above since both mount on this page.
  const deleteBaseCvMutation = useDeleteBaseCv({
    onSettled: () => setDeletingBaseCvId(null),
  });
  const exportBaseCvMutation = useExportBaseCvPdf();
  const exportBaseCvMarkdownMutation = useExportBaseCvMarkdown();

  const handleDeleteBaseCv = useCallback(
    (baseCv: BaseCv) => {
      setDeletingBaseCvId(baseCv.id);
      deleteBaseCvMutation.mutate(baseCv.id, {
        onSuccess: () => {
          // The deleted CV is no longer a valid selection; a lone remaining
          // CV re-preselects itself through the picker's own effect.
          setSelectedBaseCvId((current) =>
            current === baseCv.id ? null : current,
          );
        },
      });
    },
    [deleteBaseCvMutation],
  );

  const handleExportBaseCv = useCallback(
    (baseCv: BaseCv) => {
      setExportingBaseCvId(baseCv.id);
      exportBaseCvMutation.mutate(
        { id: baseCv.id, name: baseCv.name },
        { onSettled: () => setExportingBaseCvId(null) },
      );
    },
    [exportBaseCvMutation],
  );

  const handleExportBaseCvMarkdown = useCallback(
    (baseCv: BaseCv) => {
      setExportingBaseCvMarkdownId(baseCv.id);
      exportBaseCvMarkdownMutation.mutate(
        { id: baseCv.id, name: baseCv.name },
        { onSettled: () => setExportingBaseCvMarkdownId(null) },
      );
    },
    [exportBaseCvMarkdownMutation],
  );

  // `onValueChange` feeds a `useEffect` inside the picker (the lone option
  // selects itself), so it has to be stable or the effect re-runs every render.
  const handleSelect = useCallback((id: string) => setSelectedBaseCvId(id), []);

  const readOnlyReason: TailoredCvReadOnlyReason | null =
    application?.finalized_at != null
      ? "finalized"
      : isViewingPastCycle
        ? "archived"
        : null;

  const noCopyYet = copyDeleted || isNoTailoredCv(cvError);
  /** R-026/R-028: the switch and the fit exist only with a job description. */
  const hasJobDescription = Boolean(application?.job_description?.trim());
  // PRD 0013: both are job-board tools, shown only with `jobs`. An existing
  // keyword copy keeps its "Reordered by job match" list either way.
  const hasJobs = useHasFeature("jobs").has;
  const jobTools = hasJobs && hasJobDescription;
  const fit = useApplicationCvFit(
    applicationId,
    Boolean(cv) && !noCopyYet && jobTools,
  );
  /** A 404 is "no copy" (or a race with a delete): no panel, not an error. */
  const fitIsNoCopy = isNoTailoredCv(fit.error);
  const sourceCvName =
    baseCvs.data?.find((item) => item.id === cv?.base_cv_id)?.name ?? null;

  // Baseline resolution (KODI-017): the snapshot taken at copy time, else the
  // CURRENT master CV via `base_cv_id`, else no diff UI at all — the "source
  // CV deleted" note above stays exactly as it is either way.
  const baselineSnapshot: CvDiffSnapshot | null = useMemo(() => {
    if (!cv) return null;
    if (cv.base_snapshot) return cv.base_snapshot;
    if (cv.base_cv_id) {
      const master = baseCvs.data?.find((item) => item.id === cv.base_cv_id);
      if (master) return master;
    }
    return null;
  }, [cv, baseCvs.data]);

  // The bar renders even though `baselineSnapshot` did not resolve YET when
  // the copy names a source that should give us one — that is the "download
  // disabled with a reason" case the master-CV fetch itself failing.
  const diffUnresolved = Boolean(
    cv &&
    (cv.base_snapshot != null || cv.base_cv_id != null) &&
    !baselineSnapshot &&
    baseCvs.error,
  );

  const cvDiff = useCvDiff({
    form,
    baseline: baselineSnapshot,
    baselineLabel: sourceCvName,
    adjustments: cv?.adjustments,
    readOnly: Boolean(readOnlyReason),
  });

  function renderBody() {
    if (!applicationId) {
      return (
        <PageMessage
          title="No application selected"
          body="Open an application from your list to work on its CV copy."
        />
      );
    }

    if (applicationLoading) {
      return (
        <div
          aria-busy
          aria-label="Loading this application"
          className="grid gap-6 md:grid-cols-2"
        >
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      );
    }

    if (!application) {
      return (
        <PageMessage
          alert
          title="Could not open this application"
          body={
            applicationError
              ? getApiError(applicationError as AxiosError)
              : "It is not in the cycle you are viewing. Switch cycles from the applications list and open its CV from there."
          }
        />
      );
    }

    if (noCopyYet) {
      return (
        <BaseCvPicker
          options={baseCvs.data}
          isLoading={baseCvs.isLoading}
          error={
            baseCvs.error ? getApiError(baseCvs.error as AxiosError) : null
          }
          onRetry={() => void baseCvs.refetch()}
          value={selectedBaseCvId}
          onValueChange={handleSelect}
          onCreate={() => {
            if (!selectedBaseCvId) return;
            createMutation.mutate({
              baseCvId: selectedBaseCvId,
              tailoring: jobTools && tailorByKeywords ? "keywords" : "copy",
            });
          }}
          isCreating={createMutation.isPending}
          tailorByKeywords={tailorByKeywords}
          onTailorByKeywordsChange={jobTools ? setTailorByKeywords : undefined}
          onDelete={handleDeleteBaseCv}
          deletingId={deletingBaseCvId}
          onExport={handleExportBaseCv}
          exportingId={exportingBaseCvId}
          onExportMarkdown={handleExportBaseCvMarkdown}
          exportingMarkdownId={exportingBaseCvMarkdownId}
          readOnlyReason={readOnlyReason}
        />
      );
    }

    if (cvError) {
      return (
        <PageMessage
          alert
          title="Could not load this CV copy"
          body={getApiError(cvError as AxiosError)}
        />
      );
    }

    if (cvLoading || !cv) {
      return (
        <div
          aria-busy
          aria-label="Loading this CV copy"
          className="grid gap-6 md:grid-cols-2"
        >
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      );
    }

    return (
      <>
        {/*
          The editor is the ONLY surface on this route that spends the whole
          shell width (KODI-017) — every other branch above (no application,
          loading, error, the picker in every one of its states) stays in the
          reading column. `readOnlyReason` does not branch the return here, so
          one marker covers both the editable and the read-only editor.
        */}
        <FullWidthContent />
        <TailoredCvEditor
          form={form}
          onSubmit={form.handleSubmit(
            (values) => updateMutation.mutate(toTailoredCvPayload(values)),
            (errors) => {
              const message = sectionErrorMessage(errors);
              if (message) toast.error(message);
            },
          )}
          baseCvId={cv.base_cv_id}
          sourceCvName={sourceCvName}
          jobDescription={application.job_description}
          onAddJobDescription={() => setEditingApplication(true)}
          fit={
            jobTools && !fitIsNoCopy ? (
              <CvFitPanel
                fit={fit.data}
                isLoading={fit.isLoading}
                isError={fit.isError}
                onRetry={() => void fit.refetch()}
                isRetrying={fit.isFetching}
                dirty={!readOnlyReason && form.formState.isDirty}
              />
            ) : undefined
          }
          isSubmitting={updateMutation.isPending}
          onDelete={() => deleteMutation.mutate()}
          isDeleting={deleteMutation.isPending}
          readOnlyReason={readOnlyReason}
          diffSummary={
            cvDiff.hasBaseline ? (
              <div className="flex flex-col gap-3">
                {cvDiff.diffSummary}
                <CvDiffDownloadRow
                  onExportPdf={() => {
                    setDiffDownloadError(null);
                    exportDiffPdfMutation.mutate();
                  }}
                  onExportMarkdown={() => {
                    setDiffDownloadError(null);
                    exportDiffMarkdownMutation.mutate();
                  }}
                  isExportingPdf={exportDiffPdfMutation.isPending}
                  isExportingMarkdown={exportDiffMarkdownMutation.isPending}
                  disabledReason={diffDownloadError}
                  dirty={form.formState.isDirty}
                />
              </div>
            ) : diffUnresolved ? (
              <CvDiffDownloadRow
                onExportPdf={() => {}}
                onExportMarkdown={() => {}}
                disabledReason="Could not check the original master CV to compare against. Try reloading the page."
              />
            ) : undefined
          }
          diff={cvDiff.slots}
          actions={
            <ExportCvButton
              onExport={() => exportMutation.mutate()}
              isExporting={exportMutation.isPending}
              onExportMarkdown={() => exportMarkdownMutation.mutate()}
              isExportingMarkdown={exportMarkdownMutation.isPending}
            />
          }
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <LinkButton
          href="/applications"
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
        >
          <ArrowLeft aria-hidden />
          Back to applications
        </LinkButton>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Application CV
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {application
              ? `${application.role} · ${application.company_name}`
              : "This application's own copy of a master CV, edited for the job."}
          </p>
        </div>
      </div>

      {renderBody()}

      {/*
        The same sheet the applications list uses, so a missing job description
        can be written from beside the CV copy instead of navigating away. It
        invalidates `["applications"]` on success, which is what puts the new
        text into the panel.
      */}
      {application && !readOnlyReason ? (
        <ApplicationFormSheet
          open={editingApplication}
          onOpenChange={setEditingApplication}
          application={application}
        />
      ) : null}
    </div>
  );
}
