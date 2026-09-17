"use client";

import { useId } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  CV_PDF_EXPORT_LABEL,
  CV_PDF_EXPORT_PENDING,
  CV_PDF_LAYOUT_NOTICE,
} from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

export interface ExportCvButtonProps {
  /** Asks the server for the PDF. The caller owns the request and the errors. */
  onExport: () => void | Promise<void>;
  /** Disables the button and swaps the icon for a spinner while the server renders. */
  isExporting?: boolean;
  /** Visible text and accessible name. Keep the two identical (WCAG 2.5.3). */
  label?: string;
  /** Secondary by default: the export sits beside a save, never instead of it. */
  variant?: ButtonProps["variant"];
  /**
   * Names the CV in the accessible name, the way the gallery's `Edit {name}`
   * and `Delete {name}` do. The name is COMPOSED from the visible `label`, so a
   * caller cannot break WCAG 2.5.3 by passing an unrelated string.
   */
  cvName?: string;
  /**
   * `"inline"` is the editor footer: a full-size button beside the visible
   * layout notice. `"compact"` is a gallery tile: a small button and NO
   * notice at all — see the note on the notice below.
   */
  layout?: "inline" | "compact";
  className?: string;
}

/**
 * Asks for the server-rendered PDF of the CV on screen, and says in the same
 * breath that the preview beside it is not that PDF.
 *
 * Presentational: it imports no service and no hook. It takes `onExport` and
 * `isExporting` and renders the three states the export has — idle, in flight,
 * and available on a CV that can no longer be edited.
 *
 * The notice is part of the component, not a decoration the caller adds, so it
 * travels with the button to every EDITOR footer the button is dropped into and
 * stays wired to it through `aria-describedby`. The button is NEVER disabled by
 * a read-only application or by a deleted source CV — reading and exporting a
 * locked CV copy is allowed; only a render already in flight disables it.
 *
 * `layout="compact"` renders NO notice: no `<p>`, and no `aria-describedby`
 * pointing at one. The notice qualifies a PREVIEW the user could mistake for
 * the PDF, and a gallery tile renders no preview — so on `/cvs` it described
 * nothing. It was `sr-only` there, which made it the worst of both: a screen
 * reader heard "Preview does not show the final PDF layout." up to three times,
 * once per tile, about a document the page never shows, while a sighted user
 * never saw it at all. The download button stands alone on a tile.
 *
 * This changes WHERE the notice is said, never WHAT it says.
 * `CV_PDF_LAYOUT_NOTICE` is byte-identical and `layout="inline"` — the default,
 * and the editors' copy — is untouched.
 */
export function ExportCvButton({
  onExport,
  isExporting = false,
  label = CV_PDF_EXPORT_LABEL,
  variant = "outline",
  cvName,
  layout = "inline",
  className,
}: ExportCvButtonProps) {
  const noticeId = useId();
  const compact = layout === "compact";

  return (
    <div
      className={cn(
        compact
          ? // `display: contents` so the button is a direct flex item of the
            // tile's footer row and the two hidden nodes add no box.
            "contents"
          : "flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3",
        className,
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

      {compact ? null : (
        <p
          id={noticeId}
          className="max-w-[34ch] text-xs text-pretty text-muted-foreground"
        >
          {CV_PDF_LAYOUT_NOTICE}
        </p>
      )}

      {/* Empty but mounted: a live region inserted at the same tick may not announce. */}
      <span aria-live="polite" className="sr-only">
        {isExporting ? CV_PDF_EXPORT_PENDING : ""}
      </span>
    </div>
  );
}
