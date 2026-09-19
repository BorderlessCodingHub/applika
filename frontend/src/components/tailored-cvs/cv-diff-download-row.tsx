"use client";

import { useId } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CV_DIFF_DOWNLOAD_LABEL = "Download changes";
export const CV_DIFF_DOWNLOAD_PDF_LABEL = "PDF";
export const CV_DIFF_DOWNLOAD_MARKDOWN_LABEL = "Markdown";
export const CV_DIFF_DOWNLOAD_PENDING =
  "Preparing your download. This can take a few seconds.";
/** Said near the buttons while the form holds unsaved edits (PINNED wording). */
export const CV_DIFF_DOWNLOAD_DIRTY_NOTICE =
  "Downloads reflect the last saved version.";

export interface CvDiffDownloadRowProps {
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  isExportingPdf?: boolean;
  isExportingMarkdown?: boolean;
  /** Given, disables both buttons and shows why (a 409 or an unresolved baseline). */
  disabledReason?: string | null;
  /** The form holds edits the last download would not reflect. */
  dirty?: boolean;
  className?: string;
}

/**
 * The copy editor's "Download changes" affordance (KODI-017 part 3): the diff
 * between the copy and its baseline, rendered by the SERVER (ADR 0011), as a
 * Markdown file or a PDF. Sits beside `CvDiffSummaryBar` in the editor's
 * `diffSummary` slot.
 *
 * Mirrors `ExportCvButton`'s pending/live-region pattern rather than forking
 * it: a spinner on the button already in flight, and one always-mounted
 * `aria-live` region so a screen reader hears the render start even though
 * nothing else on the button's accessible name changes.
 */
export function CvDiffDownloadRow({
  onExportPdf,
  onExportMarkdown,
  isExportingPdf = false,
  isExportingMarkdown = false,
  disabledReason,
  dirty = false,
  className,
}: CvDiffDownloadRowProps) {
  const reasonId = useId();
  const disabled = Boolean(disabledReason);
  const pending = isExportingPdf || isExportingMarkdown;

  return (
    <div
      data-slot="cv-diff-download"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 shadow-sm",
        className,
      )}
    >
      <span className="text-sm font-medium">{CV_DIFF_DOWNLOAD_LABEL}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pending}
          aria-busy={isExportingPdf}
          aria-label={`${CV_DIFF_DOWNLOAD_LABEL} as ${CV_DIFF_DOWNLOAD_PDF_LABEL}`}
          aria-describedby={disabled ? reasonId : undefined}
          onClick={onExportPdf}
        >
          {isExportingPdf ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Download aria-hidden />
          )}
          {CV_DIFF_DOWNLOAD_PDF_LABEL}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pending}
          aria-busy={isExportingMarkdown}
          aria-label={`${CV_DIFF_DOWNLOAD_LABEL} as ${CV_DIFF_DOWNLOAD_MARKDOWN_LABEL}`}
          aria-describedby={disabled ? reasonId : undefined}
          onClick={onExportMarkdown}
        >
          {isExportingMarkdown ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <FileText aria-hidden />
          )}
          {CV_DIFF_DOWNLOAD_MARKDOWN_LABEL}
        </Button>
      </div>

      {disabledReason ? (
        <p
          id={reasonId}
          role="status"
          className="text-xs text-muted-foreground"
        >
          {disabledReason}
        </p>
      ) : null}
      {dirty ? (
        <p className="text-xs text-muted-foreground">
          {CV_DIFF_DOWNLOAD_DIRTY_NOTICE}
        </p>
      ) : null}

      {/* Empty but mounted: a live region inserted at the same tick may not announce. */}
      <span aria-live="polite" className="sr-only">
        {pending ? CV_DIFF_DOWNLOAD_PENDING : ""}
      </span>
    </div>
  );
}
