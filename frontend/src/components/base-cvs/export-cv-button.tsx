"use client";

import { useId } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { useLocale } from "next-intl";

import { Button, type ButtonProps } from "@/components/ui/button";
import { CV_EXPORT_COPY } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

export interface ExportCvButtonProps {
  /** Asks the server for the PDF. The caller owns the request and the errors. */
  onExport: () => void | Promise<void>;
  /** Disables the button and swaps the icon for a spinner while the server renders. */
  isExporting?: boolean;
  /**
   * Asks the server for the SAME CV as Markdown (KODI-017 part 3), rendered
   * beside the PDF button. Omit only for a surface with no Markdown route yet
   * — every call site the slice names passes it.
   */
  onExportMarkdown?: () => void | Promise<void>;
  isExportingMarkdown?: boolean;
  /** Visible text and accessible name. Keep the two identical (WCAG 2.5.3). */
  label?: string;
  markdownLabel?: string;
  /** Secondary by default: the export sits beside a save, never instead of it. */
  variant?: ButtonProps["variant"];
  /**
   * Names the CV in the accessible name, the way the gallery's `Edit {name}`
   * and `Delete {name}` do. The name is COMPOSED from the visible `label`, so a
   * caller cannot break WCAG 2.5.3 by passing an unrelated string.
   */
  cvName?: string;
  /**
   * `"inline"` is the editor footer: full-size buttons beside the visible
   * layout notice. `"compact"` is a gallery tile: small buttons and NO
   * notice at all — see the note on the notice below.
   */
  layout?: "inline" | "compact";
  className?: string;
}

/**
 * Asks for the server-rendered PDF (and, since KODI-017 part 3, Markdown) of
 * the CV on screen, and says in the same breath that the preview beside it is
 * not the final PDF layout.
 *
 * Presentational: it imports no service and no hook. It takes `onExport` /
 * `onExportMarkdown` and their own `isExporting*` flags and renders the three
 * states each export has — idle, in flight, and available on a CV that can no
 * longer be edited.
 *
 * The notice is part of the component, not a decoration the caller adds, so it
 * travels with the button to every EDITOR footer the button is dropped into and
 * stays wired to it through `aria-describedby`. Neither button is EVER
 * disabled by a read-only application or a deleted source CV — reading and
 * exporting a locked CV copy is allowed; only a render already in flight
 * disables its own button.
 *
 * `layout="compact"` renders NO notice: no `<p>`, and no `aria-describedby`
 * pointing at one. The notice qualifies a PREVIEW the user could mistake for
 * the PDF, and a gallery tile renders no preview — so on `/cvs` it described
 * nothing. This changes WHERE the notice is said, never WHAT it says.
 * `CV_EXPORT_COPY.layoutNotice` is byte-identical and `layout="inline"` — the
 * default, and the editors' copy — is untouched.
 */
export function ExportCvButton({
  onExport,
  isExporting = false,
  onExportMarkdown,
  isExportingMarkdown = false,
  label = CV_EXPORT_COPY.pdfLabel,
  markdownLabel = CV_EXPORT_COPY.markdownLabel,
  variant = "outline",
  cvName,
  layout = "inline",
  className,
}: ExportCvButtonProps) {
  // Subscribes: the `CV_EXPORT_COPY` words follow a language switch.
  useLocale();
  const noticeId = useId();
  const compact = layout === "compact";
  const pending = isExporting
    ? CV_EXPORT_COPY.pdfPending
    : isExportingMarkdown
      ? CV_EXPORT_COPY.markdownPending
      : "";

  return (
    <div
      className={cn(
        compact
          ? // `display: contents` so the buttons are direct flex items of the
            // tile's own footer row and the two hidden nodes add no box.
            "contents"
          : "flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
    >
      <div
        className={cn(
          compact ? "contents" : "flex flex-wrap items-center gap-2",
        )}
      >
        <Button
          type="button"
          variant={variant}
          size={compact ? "sm" : undefined}
          onClick={() => void onExport()}
          disabled={isExporting}
          aria-busy={isExporting}
          aria-label={cvName ? `${label} ${cvName}` : undefined}
          aria-describedby={compact ? undefined : noticeId}
        >
          {isExporting ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Download aria-hidden />
          )}
          {label}
        </Button>

        {onExportMarkdown ? (
          <Button
            type="button"
            variant={variant}
            size={compact ? "sm" : undefined}
            onClick={() => void onExportMarkdown()}
            disabled={isExportingMarkdown}
            aria-busy={isExportingMarkdown}
            aria-label={cvName ? `${markdownLabel} ${cvName}` : undefined}
            aria-describedby={compact ? undefined : noticeId}
          >
            {isExportingMarkdown ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <FileText aria-hidden />
            )}
            {markdownLabel}
          </Button>
        ) : null}
      </div>

      {compact ? null : (
        <p
          id={noticeId}
          className="max-w-[34ch] text-xs text-pretty text-muted-foreground"
        >
          {CV_EXPORT_COPY.layoutNotice}
        </p>
      )}

      {/* Empty but mounted: a live region inserted at the same tick may not announce. */}
      <span aria-live="polite" className="sr-only">
        {pending}
      </span>
    </div>
  );
}
