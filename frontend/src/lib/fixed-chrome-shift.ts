"use client";

import { useEffect } from "react";

/** The CSS property `phone.css` moves the fixed bottom chrome by. */
export const CHROME_SHIFT_PROPERTY = "--ph-chrome-shift";

/**
 * How far below its anchor the fixed bottom chrome has to move to sit on the
 * visible bottom edge, in whole px. Edge and Chrome on iOS hide their bottom
 * toolbar while the document scrolls but leave `position: fixed; bottom: …`
 * anchored where the toolbar's top edge was, so a gap opens under the tab
 * bar. Safari moves the anchor itself, and then this is 0.
 *
 * Never negative: a shrinking visible area (the keyboard) keeps today's
 * behaviour. Zoomed in, the visible area is a window on the page, not its
 * bottom edge: 0.
 */
export function chromeShift({
  visibleBottom,
  anchorBottom,
  scale,
}: {
  /** `visualViewport.offsetTop + visualViewport.height`. */
  visibleBottom: number;
  /** Where `position: fixed; bottom: 0` lands, from the top of the layout viewport. */
  anchorBottom: number;
  scale: number;
}): number {
  if (Math.abs(scale - 1) > 0.01) return 0;
  return Math.max(0, Math.round(visibleBottom - anchorBottom));
}

/**
 * Keeps `--ph-chrome-shift` on `<html>` equal to `chromeShift`, measured with
 * a hidden `position: fixed; bottom: 0` probe on every visual viewport resize
 * and scroll. The phone shell mounts it; unmounting removes the probe and the
 * property. A browser with no `visualViewport` gets nothing (0 in CSS).
 */
export function useFixedChromeShift(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);

    let frame = 0;
    let current = -1;
    const measure = () => {
      frame = 0;
      const shift = chromeShift({
        visibleBottom: viewport.offsetTop + viewport.height,
        anchorBottom: probe.getBoundingClientRect().top,
        scale: viewport.scale,
      });
      if (shift === current) return;
      current = shift;
      if (shift === 0) root.style.removeProperty(CHROME_SHIFT_PROPERTY);
      else root.style.setProperty(CHROME_SHIFT_PROPERTY, `${shift}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      probe.remove();
      root.style.removeProperty(CHROME_SHIFT_PROPERTY);
    };
  }, []);
}
