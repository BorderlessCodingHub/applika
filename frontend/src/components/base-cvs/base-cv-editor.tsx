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
  /** Extra footer controls, left-aligned (the seam for a later export action). */
  actions?: ReactNode;
  /** Overrides id generation for new rows. Defaults to `crypto.randomUUID()`. */
  newItemId?: () => string;
  className?: string;
}

/**
 * The master CV form body, shared by the create and the edit route. Renders the
 * identity block, the summary, the skills chips and the five repeatable
 * sections, with a live document preview beside the form at `md` and up and
 * below it on narrow screens.
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
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <CvFormSections
          form={form}
          disabled={isSubmitting}
          newItemId={newItemId}
        />

        <aside
          aria-label="CV preview"
          className="min-w-0 space-y-2 md:sticky md:top-20"
        >
          <p className="text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
            Live preview
          </p>
          <CvDocumentPreview cv={previewCv} />
        </aside>
      </div>

      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/85 py-3 backdrop-blur">
        {actions ? (
          <div className="mr-auto flex items-center gap-2">{actions}</div>
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
