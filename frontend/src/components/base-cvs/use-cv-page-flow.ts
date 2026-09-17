"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CvDocumentBlock } from "@/components/base-cvs/cv-document-blocks";
import {
  CV_PAGE_CONTENT_HEIGHT_PX,
  CV_PAGE_HEIGHT_PX,
  CV_PAGE_PADDING_PX,
  CV_PAGE_WIDTH_PX,
  singleCvPage,
  type CvPageLayout,
} from "@/components/base-cvs/cv-page-sheet";

export interface CvPageFlow {
  /**
   * Goes on the element that both BOUNDS the preview's width and CONTAINS the
   * sheets. Its `clientWidth` gives the scale; its `[data-cv-block]`
   * descendants give the heights.
   */
  frameRef: React.RefObject<HTMLDivElement | null>;
  /** Fit-to-column factor for one sheet. Never above 1. */
  scale: number;
  /** At least one page, always. Never an empty trailing sheet. */
  pages: CvPageLayout[];
}

/**
 * How tall one atom renders, in UNSCALED CSS pixels.
 *
 * A function rather than a map so the distribution can be driven from injected
 * numbers in a test: jsdom reports every height as zero, so the only honest
 * way to exercise the arithmetic is to hand it the heights directly.
 */
export type CvBlockHeight = (block: CvDocumentBlock) => number;

/** The heights measured off the DOM, keyed by {@link CvDocumentBlock.key}. */
export type CvBlockHeights = ReadonlyMap<string, number>;

/**
 * Flow an ordered list of atoms across A4 sheets.
 *
 * PURE, and the whole algorithm: the hook below only supplies the heights. The
 * rules, in the order they are applied to each block:
 *
 *  1. A block costs `spacingBefore + height`, or just `height` when it is the
 *     first on its sheet — a page never opens with a dangling top margin, so
 *     it is never charged for one either.
 *  2. It goes on the current sheet while the running total fits
 *     {@link CV_PAGE_CONTENT_HEIGHT_PX}; otherwise it opens the next one.
 *  3. `keepWithNext` (section headings) moves the block to the next sheet
 *     TOGETHER with the block after it, so a ruled heading is never stranded
 *     alone at the foot of a page.
 *  4. An atom taller than a whole sheet gets a sheet to itself, `overflowing`,
 *     grown to its own height plus the two margins. It is shown WHOLE; nothing
 *     is ever clipped or bled onto the next sheet.
 *  5. A sheet exists only once a block has been assigned to it. Nothing is ever
 *     pre-opened, which is the whole of AC4: a CV that fits renders ONE sheet
 *     and no stray empty second one. With no blocks at all, one empty sheet.
 *
 * ### Why rule 3 cannot loop
 *
 * The move in rule 3 is taken only when the pair fits a WHOLE EMPTY sheet
 * (`pairFitsAnEmptySheet`). If it does not, the heading is placed where it is
 * and the entry falls through to rule 2. That single guard is what makes the
 * recursion impossible: a heading already first on its own sheet has
 * `used === 0`, so "the pair does not fit here" and "the pair does not fit an
 * empty sheet" are the SAME test, the guard is false, and no further sheet is
 * opened. The loop therefore advances by at least one block on every turn.
 */
export function distributeCvBlocks(
  blocks: CvDocumentBlock[],
  heightOf: CvBlockHeight,
): CvPageLayout[] {
  const pages: CvPageLayout[] = [];
  /** The sheet being filled, and how much of its content box is spent. */
  let current: CvPageLayout | null = null;
  let used = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const height = heightOf(block);

    // Rule 4. Its own sheet, its own height, whole.
    if (height > CV_PAGE_CONTENT_HEIGHT_PX) {
      pages.push({
        blocks: [block],
        height: height + 2 * CV_PAGE_PADDING_PX,
        overflowing: true,
      });
      current = null;
      used = 0;
      continue;
    }

    // Rule 1. First on a sheet, a block is charged no gap above it.
    const cost = current === null ? height : block.spacingBefore + height;

    // Rule 2.
    let staysHere =
      current !== null && used + cost <= CV_PAGE_CONTENT_HEIGHT_PX;

    // Rule 3. It would fit — but would it strand a heading at the foot?
    if (staysHere && block.keepWithNext && index + 1 < blocks.length) {
      const next = blocks[index + 1];
      const nextCost = next.spacingBefore + heightOf(next);
      const strandedHere = used + cost + nextCost > CV_PAGE_CONTENT_HEIGHT_PX;
      // THE GUARD. Without it, a pair too tall for any sheet would open a
      // fresh sheet for ever.
      const pairFitsAnEmptySheet =
        height + nextCost <= CV_PAGE_CONTENT_HEIGHT_PX;

      if (strandedHere && pairFitsAnEmptySheet) staysHere = false;
    }

    if (staysHere && current !== null) {
      current.blocks.push(block);
      used += cost;
      continue;
    }

    // Rule 5: a sheet comes into existence only with a block already on it.
    current = {
      blocks: [block],
      height: CV_PAGE_HEIGHT_PX,
      overflowing: false,
    };
    used = height;
    pages.push(current);
  }

  // Rule 5, the empty case: a document with nothing in it is still one sheet.
  if (pages.length === 0) return singleCvPage(blocks);

  return pages;
}

/** Shared, so the initial state is referentially stable across renders. */
const EMPTY_HEIGHTS: CvBlockHeights = new Map<string, number>();

/**
 * `useLayoutEffect` in the browser, `useEffect` where there is no DOM.
 *
 * The static export prerenders every page, and React warns that
 * `useLayoutEffect` does nothing on the server. Neither effect runs there; the
 * swap only silences the warning.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Whether two measurements are the same document.
 *
 * Sub-pixel tolerance on purpose: a browser reports `offsetHeight` as a rounded
 * integer, but a zoom or a font swap can jitter one block by a fraction and
 * re-measuring must not then turn into a render loop.
 */
function sameHeights(a: CvBlockHeights, b: CvBlockHeights): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of b) {
    const previous = a.get(key);
    if (previous === undefined || Math.abs(previous - value) > 0.5)
      return false;
  }
  return true;
}

/**
 * The single measuring owner of the live preview: how wide a sheet may be
 * drawn, and which atoms land on which sheet.
 *
 * ## Measuring
 *
 * IN PLACE — no off-screen container. Every atom is rendered inside a
 * `[data-cv-block]` wrapper in the sheet, every sheet has the same content
 * width, so a block's height does not change when it moves between sheets: one
 * measure pass converges. An off-screen measuring container would duplicate
 * the CV's text in the DOM (breaking Playwright's strict locators) and, if
 * absolutely positioned without a positioned ancestor, would stretch `<html>`
 * and regress KODI-006's AC7 — the exact trap `frontend/CLAUDE.md` documents
 * under "an `overflow: hidden` on a STATIC ancestor clips nothing".
 *
 * `element.offsetHeight`, never `getBoundingClientRect().height`: the sheet is
 * inside a `transform: scale()`, and only `offsetHeight` is untouched by it.
 *
 * In a LAYOUT effect, so the transient single-sheet distribution never reaches
 * the screen, and SSR-guarded, because the static-export prerender has no
 * layout to read. The effect runs on EVERY render and writes state only when a
 * height really changed, so typing re-measures without looping.
 *
 * ## The no-measurement contract
 *
 * jsdom reports zero heights and has no `ResizeObserver`, the prerender has no
 * layout at all, and the first paint happens before any effect runs. In all
 * three the preview must still render a complete, correct, readable document
 * with the indicator reading `1 / 1` — {@link singleCvPage} is that path, and
 * it is a contract, not a stopgap.
 *
 * Nothing here inspects the CV. The engine sees `CvDocumentBlock[]` and heights.
 */
export function useCvPageFlow(blocks: CvDocumentBlock[]): CvPageFlow {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [heights, setHeights] = useState<CvBlockHeights>(EMPTY_HEIGHTS);

  useEffect(() => {
    const frame = frameRef.current;
    // jsdom has no ResizeObserver: leave the page unscaled instead of throwing.
    if (!frame || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const width = frame.clientWidth;
      if (width <= 0) return;
      setScale(Math.min(1, width / CV_PAGE_WIDTH_PX));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
  }, []);

  const measureBlocks = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measured = new Map<string, number>();
    for (const element of frame.querySelectorAll<HTMLElement>(
      "[data-cv-block]",
    )) {
      const key = element.getAttribute("data-cv-block");
      if (key !== null) measured.set(key, element.offsetHeight);
    }

    setHeights((previous) =>
      sameHeights(previous, measured) ? previous : measured,
    );
  }, []);

  // Every render, before paint. `useEffect` on the server, where there is no
  // layout to read and `useLayoutEffect` would warn.
  useIsomorphicLayoutEffect(measureBlocks);

  // The one reflow no render announces: a webfont swapping in changes every
  // line box under it. Absent in jsdom, where `document.fonts` is undefined.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) measureBlocks();
    });
    return () => {
      live = false;
    };
  }, [measureBlocks]);

  const pages = useMemo(
    () =>
      heights.size === 0
        ? // Nothing measured yet: the no-measurement contract above.
          singleCvPage(blocks)
        : distributeCvBlocks(blocks, (block) => heights.get(block.key) ?? 0),
    [blocks, heights],
  );

  return { frameRef, scale, pages };
}
