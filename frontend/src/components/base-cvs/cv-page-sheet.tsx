import type { CvDocumentBlock } from "@/components/base-cvs/cv-document-blocks";
import { CV_DOCUMENT_EXPORT_ID } from "@/components/base-cvs/cv-document";
import { liveCopy, word } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * A4 geometry, at the CSS reference resolution of 96dpi.
 *
 * These are the SAME numbers the sheet's own `210mm` / `15mm` CSS resolves to,
 * kept in JavaScript so the flow arithmetic and the layout cannot disagree.
 * The margins are deliberately the preview's existing 15mm, NOT the Typst
 * template's 0.55in/0.6in: the owner was offered a margin change and declined
 * it, and the preview never promised to match the PDF's page breaks anyway.
 * ---------------------------------------------------------------------- */

/** 210mm. */
export const CV_PAGE_WIDTH_PX = 793.7;
/** 297mm. */
export const CV_PAGE_HEIGHT_PX = 1122.52;
/** 15mm — the `px-[15mm] py-[15mm]` the sheet has always carried. */
export const CV_PAGE_PADDING_PX = 56.69;
/** The box a sheet's atoms have to fit inside: 267mm. */
export const CV_PAGE_CONTENT_HEIGHT_PX =
  CV_PAGE_HEIGHT_PX - 2 * CV_PAGE_PADDING_PX;

/* -------------------------------------------------------------------------
 * The words.
 *
 * Assert these, never the classes. The page indicator is PREVIEW chrome, not
 * something the PDF prints — which is why it sits outside the white sheet and
 * uses the app's semantic tokens rather than the sheet's raw `neutral-*`.
 * ---------------------------------------------------------------------- */

/** The compact indicator painted under each sheet: `1 / 2`. Decorative. */
export function cvPageIndicator(page: number, total: number): string {
  return `${page} / ${total}`;
}

/** What a screen reader hears in place of `1 / 2`, in the active language. */
export function cvPageIndicatorLabel(page: number, total: number): string {
  return word("cvs.preview.pageLabel", { page, total });
}

/**
 * The preview's chrome words, in the active language (`cvs.preview.*`). The
 * text INSIDE the sheets is the English twin of the PDF and never translates;
 * this is the app talking about it.
 *
 * - `overflowNote`: said under a sheet that had to grow because one atom
 *   outgrew A4.
 * - `pagesLabel`: names the scrollable pane, a tab stop of its own.
 * - `asideLabel` / `livePreview`: the editors' preview column and its label.
 *
 * The components rendering them subscribe (`CvDocumentPreview` calls
 * `useLocale`). Never spread this object: a spread freezes the words.
 */
export const CV_PREVIEW_COPY = liveCopy("cvs.preview", [
  "overflowNote",
  "pagesLabel",
  "asideLabel",
  "livePreview",
]);

/** Announced, once per change, when the CV's page count changes. */
export function cvPreviewPageCount(total: number): string {
  return word("cvs.preview.pageCount", { total });
}

/** The export root's accessible name: whose CV the sheets show. */
export function cvPreviewDocumentLabel(fullName: string): string {
  return fullName
    ? word("cvs.preview.documentLabel", { name: fullName })
    : word("cvs.preview.documentLabelUnnamed");
}

/* -------------------------------------------------------------------------
 * The layout contract.
 * ---------------------------------------------------------------------- */

/** One sheet's worth of the flowed document. */
export interface CvPageLayout {
  /** The atoms on this sheet, in document order. Never empty except page 1. */
  blocks: CvDocumentBlock[];
  /**
   * The sheet's UNSCALED height in CSS pixels. {@link CV_PAGE_HEIGHT_PX} for
   * every ordinary page; larger only on an overflowing one.
   */
  height: number;
  /**
   * `true` when this sheet holds a single atom taller than A4 and grew to show
   * it whole. Nothing is ever clipped: the sheet stops being A4-proportioned
   * and says so.
   */
  overflowing: boolean;
}

/**
 * The layout every renderer falls back to when nothing can be measured —
 * jsdom, the static-export prerender, the first paint before the layout effect
 * runs. One sheet, every atom on it, indicator `1 / 1`.
 *
 * This is a DESIGN requirement, not an optimisation: the preview must render a
 * complete, correct, readable document with no measurement at all.
 */
export function singleCvPage(blocks: CvDocumentBlock[]): CvPageLayout[] {
  return [{ blocks, height: CV_PAGE_HEIGHT_PX, overflowing: false }];
}

/* -------------------------------------------------------------------------
 * The components.
 * ---------------------------------------------------------------------- */

export interface CvPageStackProps {
  pages: CvPageLayout[];
  /** Fit-to-column factor. Applied per sheet, never to the chrome around it. */
  scale: number;
  /** Named on the export root, as the continuous document names its page. */
  fullName: string;
  /** Overrides {@link CV_DOCUMENT_EXPORT_ID} when more than one is mounted. */
  exportId?: string;
  className?: string;
}

/**
 * The paginated CV: an ordered list of discrete A4 sheets.
 *
 * The export root moves here from the single `<article>` of the continuous
 * document, because a multi-page document's root cannot be one of its pages.
 * It keeps `id`, `data-slot="cv-document"` and `font-sans`, and there is still
 * exactly one such node per mounted document.
 *
 * `<ol>`/`<li>` is not decoration: the pages ARE an ordered list, so a screen
 * reader is told how many there are before it reads a word of the CV.
 *
 * Pure: props in, markup out. Every measurement belongs to the caller.
 */
export function CvPageStack({
  pages,
  scale,
  fullName,
  exportId = CV_DOCUMENT_EXPORT_ID,
  className,
}: CvPageStackProps) {
  const total = pages.length;

  return (
    <article
      id={exportId}
      data-slot="cv-document"
      aria-label={cvPreviewDocumentLabel(fullName)}
      className={cn("font-sans", className)}
    >
      <ol className="flex flex-col items-center gap-4 md:gap-6">
        {pages.map((page, index) => (
          <CvPageSheet
            key={index}
            page={page}
            pageNumber={index + 1}
            pageCount={total}
            scale={scale}
          />
        ))}
      </ol>
    </article>
  );
}

export interface CvPageSheetProps {
  page: CvPageLayout;
  pageNumber: number;
  pageCount: number;
  scale: number;
}

/**
 * One sheet of paper and the chrome under it.
 *
 * Three deliberate calls:
 *
 *  - The sheet has SQUARE corners and the app's `shadow-card`, on the column
 *    background rather than inside a rounded card. Everything else in this app
 *    is a rounded card; a hard-edged white rectangle is what says "paper".
 *  - The scale is applied to the SHEET, inside a fixed-size viewport, not to
 *    the stack. So the gap between sheets and the page indicator stay at their
 *    real size at any zoom — an 11px indicator inside a 0.4 transform is 4px,
 *    which is the whole reason this is not one big scaled column.
 *  - The indicator sits OUTSIDE the printable area. The PDF prints no page
 *    number, and a folio inside the white page would read as one. Outside it,
 *    on the app's background, it is unmistakably preview chrome — and it is
 *    therefore chrome by the colour rule too: it uses `text-muted-foreground`
 *    and flips with the theme, while everything inside the sheet stays raw
 *    `neutral-*` so the artefact looks identical in light and dark mode.
 */
export function CvPageSheet({
  page,
  pageNumber,
  pageCount,
  scale,
}: CvPageSheetProps) {
  return (
    <li
      data-slot="cv-page"
      data-page={pageNumber}
      data-overflowing={page.overflowing ? "true" : undefined}
      className="flex max-w-full flex-col"
      style={{ width: CV_PAGE_WIDTH_PX * scale }}
    >
      <div
        className="overflow-hidden bg-white shadow-card"
        style={{ height: page.height * scale }}
      >
        <div
          data-slot="cv-page-sheet"
          className="origin-top-left bg-white px-[15mm] py-[15mm] font-sans text-neutral-900"
          style={{
            width: CV_PAGE_WIDTH_PX,
            height: page.height,
            transform: `scale(${scale})`,
          }}
        >
          {page.blocks.map((block, index) => (
            <div
              key={block.key}
              data-cv-block={block.key}
              // The rhythm the continuous document gets from `mt-5`/`pt-2`/
              // `space-y-*`. Dropped on the first atom of a sheet, so no page
              // opens with a dangling top margin.
              style={
                index === 0 ? undefined : { marginTop: block.spacingBefore }
              }
            >
              {block.node}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        {page.overflowing ? (
          <p className="min-w-0 text-[11px] text-pretty text-muted-foreground">
            {CV_PREVIEW_COPY.overflowNote}
          </p>
        ) : null}
        <p className="ml-auto shrink-0 font-numeric text-[11px] leading-none text-muted-foreground">
          <span className="sr-only">
            {cvPageIndicatorLabel(pageNumber, pageCount)}
          </span>
          <span aria-hidden>{cvPageIndicator(pageNumber, pageCount)}</span>
        </p>
      </div>
    </li>
  );
}
