"use client";

import type { FormEventHandler, ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CvFormSections,
  defaultNewItemId,
  useCvPreviewData,
} from "@/components/base-cvs/cv-form-sections";
import { CvDocumentPreview } from "@/components/base-cvs/cv-document-preview";
import type { CvFormValues } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

export interface BaseCvEditorProps {
  /** The react-hook-form instance. The caller owns the schema and the defaults. */
  form: UseFormReturn<CvFormValues>;
  /** Usually `form.handleSubmit(onValid, onInvalid)`. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Visible text and accessible name of the submit button. */
  submitLabel?: string;
  /** Renders a Cancel button when given. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Disables every control and puts a spinner on submit. */
  isSubmitting?: boolean;
  /** Extra footer controls, left-aligned (the seam the PDF export hangs off). */
  actions?: ReactNode;
  /** Overrides id generation for new rows. Defaults to `crypto.randomUUID()`. */
  newItemId?: () => string;
  className?: string;
}

/**
 * The master CV form body, shared by the create and the edit route. Renders the
 * identity block, the summary and the seven repeatable sections — links,
 * skills (categories of keywords), experience, projects, education,
 * certifications and languages — with a live document preview beside the form
 * at `md` and up and below it on narrow screens.
 *
 * Controlled and presentational: it neither owns the schema nor fetches nor
 * submits. Hand it a `form` and an `onSubmit`; it renders the fields, the
 * inline errors that `form` already holds and the submit/cancel footer.
 */
export function BaseCvEditor({
  form,
  onSubmit,
  submitLabel = "Save CV",
  onCancel,
  cancelLabel = "Cancel",
  isSubmitting = false,
  actions,
  newItemId = defaultNewItemId,
  className,
}: BaseCvEditorProps) {
  const previewCv = useCvPreviewData(form.control);

  return (
    <form onSubmit={onSubmit} className={cn("space-y-6", className)} noValidate>
      {/*
        Strictly half and half at EVERY width — two equal `1fr` tracks, no cap
        on either side. KODI-008 capped the preview at `2xl` and gave the
        surplus to the form; KODI-009 reverses that on the owner's own words:
        "increace the preview width size keep 50/50 w-1/2 to the CV form and
        w-1/2 to CV preview". Do not re-introduce a `2xl` (or any) cap — the
        asymmetry was tried and rejected. Below `md` the two stack, form first.
      */}
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <CvFormSections
          form={form}
          disabled={isSubmitting}
          newItemId={newItemId}
        />

        {/*
          Stuck to the TOP of the scrollport, and exactly as tall as it.

          KODI-009, the owner: "when I scroll the page the live preciew creates
          a gap from the top of the page". It did, by 104px, every one of which
          was dead: `md:top-20` reserved 5rem for chrome that does not exist
          INSIDE `main` — `main` is the scrollport and the shell `Header` is
          its sibling, above it, so a sticky offset here clears nothing — and
          the preview's own `12rem` cap was the constant tuned to fit under
          that gap. Measured in Chrome at 720px: the first sheet sat 104px
          below the top of the scrollport at every scroll position while the
          form column ran to 0. Now 24px, which is the "Live preview" label
          and its gap — visible chrome, not dead band.

          `max-h-scrollport`, never `100dvh`: the pane lives in `main`, which is
          one header shorter than the viewport. The aside is a flex COLUMN so
          the preview fills whatever the label and the caption leave, instead of
          a third constant guessing at their height.
        */}
        <aside
          aria-label="CV preview"
          className={cn(
            "min-w-0 space-y-2",
            "md:sticky md:top-0 md:flex md:max-h-scrollport md:flex-col",
          )}
        >
          <p className="shrink-0 text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
            Live preview
          </p>
          <CvDocumentPreview cv={previewCv} className="md:min-h-0 md:flex-1" />
        </aside>
      </div>

      {/*
        `sticky`, never `fixed`: `CookieConsent` reserves its height on `body`,
        so this row lands above the bar at every width (frontend/CLAUDE.md,
        "Stacking contract"). The e2e suite hit-tests it with the notice up.
      */}
      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/85 py-3 backdrop-blur">
        {actions ? (
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
