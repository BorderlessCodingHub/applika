"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AxiosError } from "axios";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import { ExportCvButton } from "@/components/base-cvs/export-cv-button";
import type { CvFormValues } from "@/components/base-cvs/types";
import { BaseCvPicker } from "@/components/tailored-cvs/base-cv-picker";
import { TailoredCvEditor } from "@/components/tailored-cvs/tailored-cv-editor";
import {
  emptyTailoredCvValues,
  sectionErrorMessage,
  tailoredCvSchema,
  tailoredCvToFormValues,
  toTailoredCvPayload,
} from "@/components/tailored-cvs/tailored-cv-schema";
import type { TailoredCvReadOnlyReason } from "@/components/tailored-cvs/types";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCycleContext } from "@/contexts/cycle-context";
import { useApplicationById } from "@/hooks/use-applications";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useCreateTailoredCv } from "@/hooks/use-create-tailored-cv";
import { useDeleteTailoredCv } from "@/hooks/use-delete-tailored-cv";
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
  const [editingApplication, setEditingApplication] = useState(false);
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
    onSuccess: () => setCopyDeleted(false),
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

  // `onValueChange` feeds a `useEffect` inside the picker (the lone option
  // selects itself), so it has to be stable or the effect re-runs every render.
  const handleSelect = useCallback((id: string) => setSelectedBaseCvId(id), []);

  const readOnlyReason: TailoredCvReadOnlyReason | null = application?.finalized
    ? "finalized"
    : isViewingPastCycle
      ? "archived"
      : null;

  const noCopyYet = copyDeleted || isNoTailoredCv(cvError);
  const sourceCvName =
    baseCvs.data?.find((item) => item.id === cv?.base_cv_id)?.name ?? null;

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
            if (selectedBaseCvId) createMutation.mutate(selectedBaseCvId);
          }}
          isCreating={createMutation.isPending}
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
        isSubmitting={updateMutation.isPending}
        onDelete={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
        readOnlyReason={readOnlyReason}
        actions={
          <ExportCvButton
            onExport={() => exportMutation.mutate()}
            isExporting={exportMutation.isPending}
          />
        }
      />
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
