"use client";

import { useEffect, useRef, useState } from "react";
import {
  CvDocument,
  type CvDocumentData,
} from "@/components/base-cvs/cv-document";
import { cn } from "@/lib/utils";

/** 210mm at 96dpi — the natural width of the A4 page the document renders at. */
const PAGE_WIDTH_PX = 793.7;

export interface CvDocumentPreviewProps {
  cv: CvDocumentData;
  /** Passed through to `CvDocument` when more than one document is mounted. */
  exportId?: string;
  className?: string;
}

/**
 * Frame that shrinks the A4 `CvDocument` to the width of its column so the live
 * preview fits beside the editor without a horizontal scrollbar. It never scales
 * above 1.
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
    <div
      ref={frameRef}
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-white shadow-card",
        className,
      )}
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
  );
}
