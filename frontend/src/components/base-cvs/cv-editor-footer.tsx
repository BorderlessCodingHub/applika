"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The custom property `globals.css` reserves the editor's submit row with.
 * `max-h-editor-scrollport` subtracts it, so a sticky pane sharing the
 * scrollport with this footer stops ABOVE it instead of ending underneath.
 */
export const CV_EDITOR_FOOTER_HEIGHT_VAR = "--cv-editor-footer-height";

/**
 * Publishes the footer's measured height to the document while it is mounted,
 * and removes it on unmount — the same discipline as `CookieConsent`, for the
 * same reason.
 *
 * Measured rather than hardcoded because the row is `flex-wrap` and its
 * contents vary: `actions` is a slot, and the editors put a different number of
 * controls in it. Every width the e2e suite exercises happens to land on one
 * 61px row, so the wrap is a CAPACITY of this layout rather than something the
 * suite demonstrates — which is exactly why a constant would be the wrong
 * choice: it would be right until the first caller that wraps, and then
 * silently under-reserve.
 */
function useReservedFooterHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const footer = ref.current;
    const root = document.documentElement;
    if (!footer) return;

    const measure = () => {
      const height = Math.ceil(footer.getBoundingClientRect().height);
      root.style.setProperty(CV_EDITOR_FOOTER_HEIGHT_VAR, `${height}px`);
    };

    measure();
    // jsdom has no ResizeObserver: one measurement is still better than none.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(footer);

    return () => {
      observer?.disconnect();
      root.style.removeProperty(CV_EDITOR_FOOTER_HEIGHT_VAR);
    };
  }, [ref]);
}

export interface CvEditorFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * The CV editors' action row: pinned to the bottom of the scrollport and
 * RESERVING its own height instead of floating over the column beside it.
 *
 * `sticky`, never `fixed`: `CookieConsent` reserves its height on `body`, so
 * this row lands above the bar at every width (frontend/CLAUDE.md, "Stacking
 * contract"). The e2e suite hit-tests both facts with real geometry.
 *
 * It is shared by `BaseCvEditor` and `TailoredCvEditor` so the two cannot
 * drift, and so there is exactly ONE owner of
 * `--cv-editor-footer-height` — the second bottom-anchored measured element in
 * the app, and the one that made the preview's layout notice invisible on
 * `/cvs/new`, where no export button carries a second copy of it.
 */
export function CvEditorFooter({ children, className }: CvEditorFooterProps) {
  const footerRef = useRef<HTMLDivElement>(null);
  useReservedFooterHeight(footerRef);

  return (
    <div
      ref={footerRef}
      className={cn(
        "sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-2",
        "border-t border-border bg-background/85 py-3 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}
