"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";

import {
  buildCvDocumentBlocks,
  type CvDocumentData,
} from "@/components/base-cvs/cv-document-blocks";
import {
  CvPageStack,
  cvPreviewPageCount,
} from "@/components/base-cvs/cv-page-sheet";
import { useCvPageFlow } from "@/components/base-cvs/use-cv-page-flow";
import { CV_PDF_LAYOUT_NOTICE } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/** Names the scrollable pane, which is a tab stop of its own. */
export const CV_PREVIEW_PAGES_LABEL = "CV preview pages";

export interface CvDocumentPreviewProps {
  cv: CvDocumentData;
  /** Passed through to `CvPageStack` when more than one document is mounted. */
  exportId?: string;
  /** Lands on the `<figure>`, not on the pane inside it. */
  className?: string;
}

/**
 * The live preview: the CV flowed across discrete A4 sheets, each shrunk to the
 * width of its column so no horizontal scrollbar ever appears.
 *
 * A `<figure>` with a `<figcaption>`, so the notice that this is not the PDF is
 * tied to the render it qualifies by markup alone — no ARIA, and no way to
 * mount the preview without it. The PDF is typeset on the server (ADR 0011);
 * this is the content, not the page. Now that the preview LOOKS like paginated
 * A4, that notice does more work, not less.
 *
 * The pane scrolls itself at `md` and up rather than growing the editor: a
 * three-page CV beside a sticky form would otherwise push the form's own
 * scroll out of reach. Its height is capped with the SAME expression
 * `h-viewport` uses, so the cookie bar's reserved strip is subtracted here too
 * (frontend/CLAUDE.md, "`CookieConsent` reserves space instead of floating").
 * Below `md` the cap is off and the sheets flow in `main`'s scroll, which is
 * where KODI-006's AC7 requires every pixel of added height to land.
 */
export function CvDocumentPreview({
  cv,
  exportId,
  className,
}: CvDocumentPreviewProps) {
  const blocks = useMemo(() => buildCvDocumentBlocks(cv), [cv]);
  const { frameRef, scale, pages } = useCvPageFlow(blocks);

  return (
    <figure className={cn("min-w-0 space-y-2", className)}>
      <div
        ref={frameRef}
        // A scroll container is only reachable by keyboard if something can be
        // focused in it, and nothing inside a CV preview is focusable.
        tabIndex={0}
        role="group"
        aria-label={CV_PREVIEW_PAGES_LABEL}
        // `relative` for the reason the shell root carries it: an absolutely
        // positioned descendant with no positioned ancestor escapes every
        // clip and stretches the DOCUMENT. `scrollbar-gutter` keeps
        // `clientWidth` constant, so the scale cannot oscillate with the
        // scrollbar it produces.
        className={cn(
          "relative min-w-0 rounded-md outline-none",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "md:max-h-[calc(100dvh-var(--cookie-notice-height,0px)-12rem)]",
          "md:[scrollbar-gutter:stable] md:overflow-y-auto md:overscroll-contain",
        )}
      >
        <CvPageStack
          pages={pages}
          scale={scale}
          fullName={cv.full_name}
          exportId={exportId}
        />
      </div>

      {/*
        The count, once, for a reader who is not going to traverse every sheet.
        It changes only when the COUNT changes, so typing into the form does not
        turn it into a chatter machine.

        `aria-live` WITHOUT `role="status"`: the read-only banner on the CV copy
        editor is the page's one `status`, and a second would break every
        `getByRole("status")` locator in the suite.
      */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {cvPreviewPageCount(pages.length)}
      </p>

      <figcaption className="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>{CV_PDF_LAYOUT_NOTICE}</span>
      </figcaption>
    </figure>
  );
}
