"use client";

import type { FormEventHandler, ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FileText, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { CvEditorFooter } from "@/components/base-cvs/cv-editor-footer";
import type { CvFormDiffSlots } from "@/components/base-cvs/cv-form-diff";
import type { CvFormValues } from "@/components/base-cvs/types";
import { JobDescriptionPanel } from "@/components/tailored-cvs/job-description-panel";
import { TailoredCvReadOnlyBanner } from "@/components/tailored-cvs/tailored-cv-read-only-banner";
import type { TailoredCvReadOnlyReason } from "@/components/tailored-cvs/types";
import { cn } from "@/lib/utils";

export interface TailoredCvEditorProps {
  /** The react-hook-form instance. The page owns the schema and the defaults. */
  form: UseFormReturn<CvFormValues>;
  /** Usually `form.handleSubmit(onValid, onInvalid)`. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** The master CV this copy came from, or `null` once that CV is deleted. */
  baseCvId: string | null;
  /** The master CV's label, when it still exists. */
  sourceCvName?: string | null;
  /** The application's job description, shown above the fields. */
  jobDescription?: string | null;
  /** Opens the application form so a missing job description can be added. */
  onAddJobDescription?: () => void;
  /** Visible text and accessible name of the submit button. Defaults to "Save CV copy" in the active language. */
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
  /**
   * Replaces Cancel and the submit button on the right of the footer. The draft
   * page (KODI-033) saves as the user types and puts its status, Back and
   * Finish here instead.
   */
  footerEnd?: ReactNode;
  /** Overrides id generation for new rows. Defaults to `crypto.randomUUID()`. */
  newItemId?: () => string;
  /** `CvFitPanel`, right under the job description; omit when there is no fit to show. */
  fit?: ReactNode;
  /** `CvDiffSummaryBar`, above Identity and contact; omit when the copy has no baseline. */
  diffSummary?: ReactNode;
  /** Marker slots for the form body while "Show changes" is on; see `CvFormDiffSlots`. */
  diff?: CvFormDiffSlots;
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
  submitLabel,
  onCancel,
  cancelLabel,
  isSubmitting = false,
  onDelete,
  isDeleting = false,
  readOnlyReason,
  actions,
  footerEnd,
  newItemId = defaultNewItemId,
  fit,
  diffSummary,
  diff,
  className,
}: TailoredCvEditorProps) {
  const t = useTranslations("cvs.tailored");
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
              {t("source.deleted")}
            </Badge>
            <p className="min-w-0 flex-1 text-xs text-pretty text-muted-foreground">
              {/* Said next to the badge, so "source CV deleted" does not read as data loss. */}
              {t("source.deletedHint")}
            </p>
          </>
        ) : (
          // A long master CV name wraps inside the badge instead of pushing
          // the page sideways at 375px (KODI-049).
          <Badge
            variant="secondary"
            className="h-auto max-w-full gap-1.5 px-2.5 py-1 text-xs font-medium wrap-anywhere whitespace-normal"
          >
            <FileText aria-hidden className="size-3.5 shrink-0" />
            {sourceCvName
              ? t("source.copiedFrom", { name: sourceCvName })
              : t("source.copiedFromMaster")}
          </Badge>
        )}
      </div>

      {/*
        50/50 at every width from `md`, like `BaseCvEditor` (KODI-009); no `2xl`
        cap (KODI-017). The job description leads the FORM column, so the DOM
        order is the mobile order too: job description, fields, preview.
      */}
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <JobDescriptionPanel
            jobDescription={jobDescription}
            onAdd={onAddJobDescription}
            disabled={readOnly}
          />
          {fit}
          {diffSummary}
          <CvFormSections
            form={form}
            disabled={locked}
            newItemId={newItemId}
            diff={diff}
          />
        </div>

        {/* Same sticky scrollport rules as `BaseCvEditor`'s aside; see frontend/CLAUDE.md "App shell". */}
        <section
          aria-label={t("editor.previewRegion")}
          className={cn(
            "min-w-0 space-y-2",
            "md:sticky md:top-0 md:flex md:max-h-editor-scrollport md:flex-col",
          )}
        >
          <p className="shrink-0 text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
            {t("editor.livePreview")}
          </p>
          <CvDocumentPreview cv={previewCv} className="md:min-h-0 md:flex-1" />
        </section>
      </div>

      {/*
        Same `CvEditorFooter` in both states, shared with `BaseCvEditor` so the
        two cannot drift: it sits above the cookie bar because `CookieConsent`
        RESERVES its height on `body` (see frontend/CLAUDE.md, "Stacking
        contract"), and it RESERVES ITS OWN height in turn for the preview
        column above. The e2e suite hit-tests both. Read-only with no `actions`
        mounts no footer at all — and then reserves nothing, which is correct.
      */}
      {readOnly ? (
        actions ? (
          <CvEditorFooter>
            <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          </CvEditorFooter>
        ) : null
      ) : (
        <CvEditorFooter>
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
            {actions}
            {onDelete ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={locked}
                    aria-label={t("editor.deleteLabel")}
                    className="text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {isDeleting ? (
                      <Loader2 aria-hidden className="animate-spin" />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                    {t("editor.deleteAction")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("editor.deleteTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("editor.deleteDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("editor.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t("editor.deleteConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>

          {footerEnd ?? (
            <>
              {onCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked}
                  onClick={onCancel}
                >
                  {cancelLabel ?? t("editor.cancel")}
                </Button>
              ) : null}
              <Button type="submit" disabled={locked} aria-busy={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : null}
                {submitLabel ?? t("editor.submit")}
              </Button>
            </>
          )}
        </CvEditorFooter>
      )}
    </form>
  );
}
