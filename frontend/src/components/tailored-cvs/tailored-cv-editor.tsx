"use client";

import type { FormEventHandler, ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FileText, Loader2, Trash2, TriangleAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CvFormSections,
  defaultNewItemId,
  useCvPreviewData,
} from "@/components/base-cvs/cv-form-sections";
import { CvDocumentPreview } from "@/components/base-cvs/cv-document-preview";
import type { CvFormValues } from "@/components/base-cvs/types";
import { JobDescriptionPanel } from "@/components/tailored-cvs/job-description-panel";
import { TailoredCvReadOnlyBanner } from "@/components/tailored-cvs/tailored-cv-read-only-banner";
import {
  TAILORED_CV_SOURCE_DELETED,
  type TailoredCvReadOnlyReason,
} from "@/components/tailored-cvs/types";
import { cn } from "@/lib/utils";

/** Said next to the badge, so "source CV deleted" does not read as data loss. */
export const TAILORED_CV_SOURCE_DELETED_HINT =
  "The master CV this copy came from has been deleted. Everything below still belongs to this application and stays editable.";

export interface TailoredCvEditorProps {
  /** The react-hook-form instance. The page owns the schema and the defaults. */
  form: UseFormReturn<CvFormValues>;
  /** Usually `form.handleSubmit(onValid, onInvalid)`. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** The master CV this copy came from, or `null` once that CV is deleted. */
  baseCvId: string | null;
  /** The master CV's label, when it still exists. */
  sourceCvName?: string | null;
  /** The application's job description, shown beside the fields. */
  jobDescription?: string | null;
  /** Opens the application form so a missing job description can be added. */
  onAddJobDescription?: () => void;
  /** Visible text and accessible name of the submit button. */
  submitLabel?: string;
  /** Renders a Cancel button when given. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Disables every control and puts a spinner on submit. */
  isSubmitting?: boolean;
  /** Called once the user confirms the deletion. Omit to hide the action. */
  onDelete?: () => void;
  isDeleting?: boolean;
  /** Locks the whole editor and explains why. See `TailoredCvReadOnlyBanner`. */
  readOnlyReason?: TailoredCvReadOnlyReason | null;
  /**
   * Extra footer controls, left-aligned. The seam the PDF export hangs off, and
   * the ONLY thing the footer carries in read-only mode.
   */
  actions?: ReactNode;
  /** Overrides id generation for new rows. Defaults to `crypto.randomUUID()`. */
  newItemId?: () => string;
  className?: string;
}

/**
 * The editor for an application's CV copy.
 *
 * It is the master CV editor's field body (`CvFormSections`, so the two can
 * never drift) with three things the copy needs and the master CV does not: the
 * application's job description beside the fields, the provenance of the copy —
 * including the case where the source master CV has been deleted — and a
 * read-only mode driven by the application's own state.
 *
 * Controlled and presentational: it neither owns the schema nor fetches nor
 * submits. In read-only mode the footer keeps ONLY `actions` — no submit, no
 * cancel, no delete — so there is nothing to disable and nothing to click by
 * accident, while the one thing a locked copy still allows, the PDF export,
 * stays reachable. A read-only editor with no `actions` renders no footer.
 */
export function TailoredCvEditor({
  form,
  onSubmit,
  baseCvId,
  sourceCvName,
  jobDescription,
  onAddJobDescription,
  submitLabel = "Save CV copy",
  onCancel,
  cancelLabel = "Cancel",
  isSubmitting = false,
  onDelete,
  isDeleting = false,
  readOnlyReason,
  actions,
  newItemId = defaultNewItemId,
  className,
}: TailoredCvEditorProps) {
  const previewCv = useCvPreviewData(form.control);
  const readOnly = Boolean(readOnlyReason);
  const locked = readOnly || isSubmitting || isDeleting;
  const sourceDeleted = baseCvId === null;

  return (
    <form onSubmit={onSubmit} className={cn("space-y-6", className)} noValidate>
      {readOnlyReason ? (
        <TailoredCvReadOnlyBanner reason={readOnlyReason} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {sourceDeleted ? (
          <>
            <Badge
              variant="outline"
              className="gap-1.5 border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive"
            >
              <TriangleAlert aria-hidden className="size-3.5" />
              {TAILORED_CV_SOURCE_DELETED}
            </Badge>
            <p className="min-w-0 flex-1 text-xs text-pretty text-muted-foreground">
              {TAILORED_CV_SOURCE_DELETED_HINT}
            </p>
          </>
        ) : (
          <Badge
            variant="secondary"
            className="gap-1.5 px-2.5 py-1 text-xs font-medium"
          >
            <FileText aria-hidden className="size-3.5" />
            {sourceCvName
              ? `Copied from ${sourceCvName}`
              : "Copied from a master CV"}
          </Badge>
        )}
      </div>

      {/*
        `display: contents` below `md` so the three blocks are direct children of
        the flex column and can be ordered: job description, then the fields,
        then the preview — read the job, edit, check the render. At `md` the
        wrapper becomes the sticky right column again.
      */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start 2xl:grid-cols-[minmax(0,1fr)_38rem]">
        <CvFormSections
          form={form}
          disabled={locked}
          newItemId={newItemId}
          className="order-2 md:order-none"
        />

        <div className="contents md:sticky md:top-20 md:block md:min-w-0 md:space-y-4">
          <JobDescriptionPanel
            jobDescription={jobDescription}
            onAdd={onAddJobDescription}
            disabled={readOnly}
            className="order-1 md:order-none"
          />

          <section
            aria-label="CV preview"
            className="order-3 min-w-0 space-y-2 md:order-none"
          >
            <p className="text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
              Live preview
            </p>
            <CvDocumentPreview cv={previewCv} />
          </section>
        </div>
      </div>

      {/*
        Same wrapper, same height rules, same `z-30` in both states: the footer
        sits above the cookie bar because `CookieConsent` RESERVES its height on
        `body` (see frontend/CLAUDE.md, "Stacking contract"), and the e2e suite
        hit-tests that a sticky footer control is still the topmost element.
      */}
      {readOnly ? (
        actions ? (
          <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/85 py-3 backdrop-blur">
            <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          </div>
        ) : null
      ) : (
        <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/85 py-3 backdrop-blur">
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
            {actions}
            {onDelete ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={locked}
                    aria-label="Delete this CV copy"
                    className="text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {isDeleting ? (
                      <Loader2 aria-hidden className="animate-spin" />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                    Delete copy
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this CV copy?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The copy and every edit you made to it are removed for
                      good. Your master CVs are untouched, and you can start a
                      new copy for this application afterwards.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>

          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
          ) : null}
          <Button type="submit" disabled={locked} aria-busy={isSubmitting}>
            {isSubmitting ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : null}
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
