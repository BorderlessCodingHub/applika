"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

import {
  CvDocument,
  type CvDocumentData,
} from "@/components/base-cvs/cv-document";
import { CV_PDF_LAYOUT_NOTICE } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/** 210mm at 96dpi — the natural width of the A4 page the document renders at. */
const PAGE_WIDTH_PX = 793.7;

export interface CvDocumentPreviewProps {
  cv: CvDocumentData;
  /** Passed through to `CvDocument` when more than one document is mounted. */
  exportId?: string;
  /** Lands on the `<figure>`, not on the page frame inside it. */
  className?: string;
}

/**
 * Frame that shrinks the A4 `CvDocument` to the width of its column so the live
 * preview fits beside the editor without a horizontal scrollbar. It never scales
 * above 1.
 *
 * A `<figure>` with a `<figcaption>`, so the notice that this is not the PDF is
 * tied to the render it qualifies by markup alone — no ARIA, and no way to mount
 * the preview without it. The PDF is typeset on the server (ADR 0011); this is
 * the content, not the page.
 */
export function CvDocumentPreview({
  cv,
  exportId,
  className,
}: CvDocumentPreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const frame = frameRef.current;
    const page = pageRef.current;
    // jsdom has no ResizeObserver: leave the page unscaled instead of throwing.
    if (!frame || !page || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const next = Math.min(1, frame.clientWidth / PAGE_WIDTH_PX);
      setScale(next);
      setHeight(page.offsetHeight * next);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(page);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <figure className={cn("min-w-0 space-y-2", className)}>
      <div
        ref={frameRef}
        className="overflow-hidden rounded-xl border border-border bg-white shadow-card"
      >
        <div style={{ height }}>
          <div
            ref={pageRef}
            style={{
              width: PAGE_WIDTH_PX,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <CvDocument cv={cv} exportId={exportId} />
          </div>
        </div>
      </div>

      <figcaption className="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>{CV_PDF_LAYOUT_NOTICE}</span>
      </figcaption>
    </figure>
  );
}
