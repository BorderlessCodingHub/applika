"use client";

import { useId } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/**
 * The row's words in the active language (`cvs.diff.download`): `label`,
 * `pdf`, `markdown`, `pending`, and `dirtyNotice` (said near the buttons while
 * the form holds unsaved edits, PINNED wording). Exported for the tests; the
 * component reads the same keys through `useTranslations`. Never spread it.
 */
export const CV_DIFF_DOWNLOAD_COPY = liveCopy("cvs.diff.download", [
  "label",
  "pdf",
  "markdown",
  "pending",
  "dirtyNotice",
]);

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
  const t = useTranslations("cvs.diff.download");
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
      <span className="text-sm font-medium">{t("label")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pending}
          aria-busy={isExportingPdf}
          aria-label={t("as", { label: t("label"), format: t("pdf") })}
          aria-describedby={disabled ? reasonId : undefined}
          onClick={onExportPdf}
        >
          {isExportingPdf ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Download aria-hidden />
          )}
          {t("pdf")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pending}
          aria-busy={isExportingMarkdown}
          aria-label={t("as", { label: t("label"), format: t("markdown") })}
          aria-describedby={disabled ? reasonId : undefined}
          onClick={onExportMarkdown}
        >
          {isExportingMarkdown ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <FileText aria-hidden />
          )}
          {t("markdown")}
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
        <p className="text-xs text-muted-foreground">{t("dirtyNotice")}</p>
      ) : null}

      {/* Empty but mounted: a live region inserted at the same tick may not announce. */}
      <span aria-live="polite" className="sr-only">
        {pending ? t("pending") : ""}
      </span>
    </div>
  );
}
