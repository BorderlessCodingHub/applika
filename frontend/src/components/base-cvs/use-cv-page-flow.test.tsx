import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildCvDocumentBlocks,
  type CvDocumentBlock,
  type CvDocumentData,
} from "./cv-document-blocks";
import { CvDocumentPreview } from "./cv-document-preview";
import {
  CV_PAGE_CONTENT_HEIGHT_PX,
  CV_PAGE_HEIGHT_PX,
  CV_PAGE_PADDING_PX,
  CV_PAGE_OVERFLOW_NOTE,
  CvPageStack,
  cvPageIndicator,
  cvPageIndicatorLabel,
  cvPreviewPageCount,
  singleCvPage,
} from "./cv-page-sheet";
import { distributeCvBlocks } from "./use-cv-page-flow";

/**
 * The A4 flow engine (KODI-008).
 *
 * The owner: "if possible, make the preview during CV creation create pages if
 * the document become too large, use A4 dimensions".
 *
 * **jsdom reports every height as zero**, so a measure-and-flow implementation
 * cannot be honestly tested here: there is no layout to measure. The split is
 * deliberate and it is the whole reason `distributeCvBlocks` is a pure function
 * taking a height lookup.
 *
 *  - HERE: the arithmetic, driven by INJECTED heights — which atom lands on
 *    which sheet, the AC4 boundary as a property of the function, the
 *    `keepWithNext` loop guard, the oversized atom, the copy, and the
 *    no-measurement fallback the prerender and the first paint both take.
 *  - `e2e/cv-builder.spec.ts`: the same criteria against a REAL browser with
 *    real line boxes — a CV that really overflows onto a second sheet, the
 *    boundary crossed with real text, no block clipped by its sheet, the full
 *    page width measured as geometry, and the restack below `md`.
 */

/** A sheet's content box, in the units the engine works in. */
const BOX = CV_PAGE_CONTENT_HEIGHT_PX;

function block(over: Partial<CvDocumentBlock> = {}): CvDocumentBlock {
  return {
    key: "b",
    kind: "experience-entry",
    section: "experience",
    keepWithNext: false,
    spacingBefore: 0,
    node: null,
    ...over,
  };
}

/** `count` identical atoms, each `height` tall with `gap` above it. */
function atoms(count: number, gap = 0): CvDocumentBlock[] {
  return Array.from({ length: count }, (_, index) =>
    block({ key: `atom-${index}`, spacingBefore: gap }),
  );
}

/** A height lookup over a `{ key: height }` table. Missing keys are zero. */
function heights(table: Record<string, number>) {
  return (entry: CvDocumentBlock) => table[entry.key] ?? 0;
}

/** Every sheet's block keys, which is the only thing the layout really says. */
function keysPerPage(pages: { blocks: CvDocumentBlock[] }[]): string[][] {
  return pages.map((page) => page.blocks.map((entry) => entry.key));
}

describe("distributeCvBlocks — a block's cost (rule 1)", () => {
  it("charges no gap above the first atom of a sheet", () => {
    // Two atoms of exactly half a sheet with a 40px gap between them. The gap
    // is spent between them and NOT above the first, so they still share one
    // sheet only if the engine really drops the leading margin.
    const pages = distributeCvBlocks(
      atoms(2, 40),
      heights({ "atom-0": BOX / 2 - 20, "atom-1": BOX / 2 - 20 }),
    );

    expect(keysPerPage(pages)).toEqual([["atom-0", "atom-1"]]);
  });

  it("charges the gap once the atom is not first, and opens a sheet for it", () => {
    // Identical heights, one pixel more of gap: now they do not fit together,
    // and the second atom opens sheet two WITHOUT paying its gap there.
    const pages = distributeCvBlocks(
      atoms(2, 41),
      heights({ "atom-0": BOX / 2 - 20, "atom-1": BOX / 2 - 20 }),
    );

    expect(keysPerPage(pages)).toEqual([["atom-0"], ["atom-1"]]);
  });
});

describe("distributeCvBlocks — AC4, exactly one sheet for a CV that fits", () => {
  it("never pre-opens a sheet: a document is only ever as many sheets as it fills", () => {
    // The classic off-by-one. A CV filling the sheet TO THE PIXEL is one
    // sheet, not one plus an empty one.
    const pages = distributeCvBlocks(atoms(1), heights({ "atom-0": BOX }));

    expect(pages).toHaveLength(1);
    expect(keysPerPage(pages)).toEqual([["atom-0"]]);
  });

  it("crosses from one sheet to two at the boundary, and nowhere else", () => {
    // Asserted AS A PROPERTY, at the crossing: the last height that fits is
    // one sheet and the first that does not is two, with nothing empty either
    // side. The same crossing is driven with real text in the E2E suite.
    for (const height of [1, BOX / 2, BOX - 1, BOX]) {
      expect(
        distributeCvBlocks(atoms(1), heights({ "atom-0": height })),
        `${height}px should be one sheet`,
      ).toHaveLength(1);
    }

    const over = distributeCvBlocks(
      [block({ key: "a" }), block({ key: "b", spacingBefore: 0 })],
      heights({ a: BOX, b: 1 }),
    );
    expect(keysPerPage(over)).toEqual([["a"], ["b"]]);
    expect(over[1].blocks).not.toHaveLength(0);
  });

  it("emits one empty sheet, not none, for a document with no atoms", () => {
    const pages = distributeCvBlocks([], heights({}));

    expect(pages).toHaveLength(1);
    expect(pages[0].blocks).toEqual([]);
    expect(pages[0].height).toBe(CV_PAGE_HEIGHT_PX);
    expect(pages[0].overflowing).toBe(false);
  });

  it("never emits a sheet with nothing on it, however the heights fall", () => {
    // A property over a spread of shapes: no trailing empty, no empty in the
    // middle, and every atom placed exactly once in its original order.
    for (const height of [10, 200, BOX / 3, BOX - 1, BOX, BOX + 1]) {
      const blocks = atoms(9, 12);
      const pages = distributeCvBlocks(
        blocks,
        heights(Object.fromEntries(blocks.map((b) => [b.key, height]))),
      );

      expect(
        pages.filter((page) => page.blocks.length === 0),
        `an empty sheet at ${height}px`,
      ).toEqual([]);
      expect(pages.flatMap((page) => page.blocks.map((b) => b.key))).toEqual(
        blocks.map((b) => b.key),
      );
    }
  });
});

describe("distributeCvBlocks — AC2, a break falls between atoms", () => {
  it("moves a whole atom to the next sheet rather than splitting it", () => {
    // The bullet list lives INSIDE its experience entry, so "never mid-bullet"
    // is the same statement as "never mid-atom": an atom is on one sheet or on
    // the other, never on both.
    const blocks = atoms(3, 12);
    const pages = distributeCvBlocks(
      blocks,
      heights({
        "atom-0": BOX * 0.6,
        "atom-1": BOX * 0.45,
        "atom-2": BOX * 0.45,
      }),
    );

    expect(keysPerPage(pages)).toEqual([["atom-0"], ["atom-1", "atom-2"]]);
    // Every atom appears on exactly one sheet.
    const placed = pages.flatMap((page) => page.blocks.map((b) => b.key));
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed).toEqual(blocks.map((b) => b.key));
  });
});

describe("distributeCvBlocks — rule 3, a heading is not stranded", () => {
  it("takes the heading to the next sheet with the entry under it", () => {
    // The heading fits at the foot of sheet one; its first entry does not.
    // Both move, so no ruled heading is left alone at the bottom of a page.
    const blocks = [
      block({ key: "filler" }),
      block({ key: "heading", kind: "section-heading", keepWithNext: true }),
      block({ key: "entry", spacingBefore: 8 }),
    ];
    const pages = distributeCvBlocks(
      blocks,
      heights({ filler: BOX - 60, heading: 30, entry: 100 }),
    );

    expect(keysPerPage(pages)).toEqual([["filler"], ["heading", "entry"]]);
  });

  it("leaves the heading where it is when the pair fits anyway", () => {
    const blocks = [
      block({ key: "filler" }),
      block({ key: "heading", kind: "section-heading", keepWithNext: true }),
      block({ key: "entry", spacingBefore: 8 }),
    ];
    const pages = distributeCvBlocks(
      blocks,
      heights({ filler: 100, heading: 30, entry: 100 }),
    );

    expect(keysPerPage(pages)).toEqual([["filler", "heading", "entry"]]);
  });

  it("THE GUARD: a pair too tall for any sheet places the heading and moves on", () => {
    // Without the guard this is an infinite loop — the pair never fits, so the
    // engine opens a fresh sheet for it, finds it still does not fit, and
    // opens another. The guard asks whether the pair would fit a WHOLE EMPTY
    // sheet, and when it would not, places the heading and lets the entry fall
    // through to the ordinary rule.
    const blocks = [
      block({ key: "filler" }),
      block({ key: "heading", kind: "section-heading", keepWithNext: true }),
      block({ key: "entry", spacingBefore: 8 }),
    ];
    const pages = distributeCvBlocks(
      blocks,
      heights({ filler: 100, heading: 30, entry: BOX - 20 }),
    );

    // It terminates, every atom is placed once, and the heading sits at the
    // foot of its sheet because nothing better exists.
    expect(keysPerPage(pages)).toEqual([["filler", "heading"], ["entry"]]);
  });

  it("does not loop when the heading is already alone on a fresh sheet", () => {
    // The degenerate case the guard also has to cover: the heading opens sheet
    // two on its own and its entry STILL does not fit beside it.
    const blocks = [
      block({ key: "filler" }),
      block({ key: "heading", kind: "section-heading", keepWithNext: true }),
      block({ key: "entry", spacingBefore: 8 }),
    ];
    const pages = distributeCvBlocks(
      blocks,
      heights({ filler: BOX - 10, heading: 30, entry: BOX - 20 }),
    );

    expect(keysPerPage(pages)).toEqual([["filler"], ["heading"], ["entry"]]);
  });

  it("keeps a trailing heading with nothing after it on the sheet it reaches", () => {
    // A heading is the LAST atom only when its section rendered nothing, which
    // `getPopulatedCvSections` already prevents — but the engine must not read
    // past the end of the list to find that out.
    const blocks = [
      block({ key: "heading", kind: "section-heading", keepWithNext: true }),
    ];
    const pages = distributeCvBlocks(blocks, heights({ heading: 30 }));

    expect(keysPerPage(pages)).toEqual([["heading"]]);
  });
});

describe("distributeCvBlocks — rule 4, an atom taller than A4", () => {
  it("gives it a sheet of its own, grown to show it whole", () => {
    const tall = BOX + 400;
    const blocks = [block({ key: "before" }), block({ key: "giant" })];
    const pages = distributeCvBlocks(
      blocks,
      heights({ before: 100, giant: tall }),
    );

    expect(keysPerPage(pages)).toEqual([["before"], ["giant"]]);
    expect(pages[1].overflowing).toBe(true);
    // Its own content box plus the two margins — never clipped to A4.
    expect(pages[1].height).toBe(tall + 2 * CV_PAGE_PADDING_PX);
    expect(pages[1].height).toBeGreaterThan(CV_PAGE_HEIGHT_PX);
  });

  it("does not let the next atom share the oversized sheet", () => {
    const blocks = [block({ key: "giant" }), block({ key: "after" })];
    const pages = distributeCvBlocks(
      blocks,
      heights({ giant: BOX + 1, after: 10 }),
    );

    expect(keysPerPage(pages)).toEqual([["giant"], ["after"]]);
    expect(pages[0].overflowing).toBe(true);
    expect(pages[1].overflowing).toBe(false);
    expect(pages[1].height).toBe(CV_PAGE_HEIGHT_PX);
  });
});

describe("the no-measurement contract", () => {
  it("degrades to ONE sheet holding the whole document when nothing measured", () => {
    // jsdom, the static-export prerender and the first paint all land here.
    // Zero heights must mean one complete readable sheet — never nothing, and
    // never N empty ones.
    const blocks = atoms(40, 12);
    const pages = distributeCvBlocks(blocks, () => 0);

    expect(pages).toHaveLength(1);
    expect(pages[0].blocks).toHaveLength(40);
    expect(pages[0].overflowing).toBe(false);
    expect(keysPerPage(pages)).toEqual(keysPerPage(singleCvPage(blocks)));
  });
});

/* ---------------------------------------------------------------------------
 * The words. Assert these, never the classes.
 * ------------------------------------------------------------------------ */

describe("the page indicator's copy (AC3)", () => {
  it("shows the compact form and says the long one to a screen reader", () => {
    expect(cvPageIndicator(1, 2)).toBe("1 / 2");
    expect(cvPageIndicatorLabel(1, 2)).toBe("Page 1 of 2");
  });

  it("says 1 / 1 on a one-page CV rather than hiding itself", () => {
    expect(cvPageIndicator(1, 1)).toBe("1 / 1");
    expect(cvPageIndicatorLabel(1, 1)).toBe("Page 1 of 1");
  });

  it("counts the pages in words, singular and plural", () => {
    expect(cvPreviewPageCount(1)).toBe("CV preview: 1 page.");
    expect(cvPreviewPageCount(3)).toBe("CV preview: 3 pages.");
  });
});

/* ---------------------------------------------------------------------------
 * The rendered stack. jsdom has no layout, so this is markup and words only.
 * ------------------------------------------------------------------------ */

const CV: CvDocumentData = {
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: null,
  summary: "Backend engineer with eight years on payment systems.",
  links: [],
  skills: [],
  experience: [
    {
      id: "e-1",
      company: "Northwind Payments",
      role: "Senior Backend Engineer",
      start: "2021-03",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
};

describe("CvPageStack", () => {
  it("renders one <li> per sheet, numbered, inside one ordered list", () => {
    const blocks = buildCvDocumentBlocks(CV);
    const pages = [
      {
        blocks: blocks.slice(0, 2),
        height: CV_PAGE_HEIGHT_PX,
        overflowing: false,
      },
      {
        blocks: blocks.slice(2),
        height: CV_PAGE_HEIGHT_PX,
        overflowing: false,
      },
    ];
    const { container } = render(
      <CvPageStack pages={pages} scale={1} fullName={CV.full_name} />,
    );

    const sheets = container.querySelectorAll('[data-slot="cv-page"]');
    expect(sheets).toHaveLength(2);
    expect(sheets[0].getAttribute("data-page")).toBe("1");
    expect(sheets[1].getAttribute("data-page")).toBe("2");
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("says why an oversized sheet is not A4-shaped", () => {
    const blocks = buildCvDocumentBlocks(CV);
    const { container } = render(
      <CvPageStack
        pages={[{ blocks, height: 2000, overflowing: true }]}
        scale={1}
        fullName={CV.full_name}
      />,
    );

    const sheet = container.querySelector('[data-slot="cv-page"]');
    expect(sheet?.getAttribute("data-overflowing")).toBe("true");
    expect(screen.getByText(CV_PAGE_OVERFLOW_NOTE)).toBeInTheDocument();
  });

  it("marks an ordinary sheet with no overflow flag at all", () => {
    const { container } = render(
      <CvPageStack
        pages={singleCvPage(buildCvDocumentBlocks(CV))}
        scale={1}
        fullName={CV.full_name}
      />,
    );

    const sheet = container.querySelector('[data-slot="cv-page"]');
    expect(sheet?.hasAttribute("data-overflowing")).toBe(false);
    expect(screen.queryByText(CV_PAGE_OVERFLOW_NOTE)).not.toBeInTheDocument();
  });
});

describe("CvDocumentPreview with no layout to measure", () => {
  it("renders exactly one sheet, reading 1 / 1, holding the whole CV (AC4)", () => {
    const { container } = render(<CvDocumentPreview cv={CV} />);

    expect(container.querySelectorAll('[data-slot="cv-page"]')).toHaveLength(1);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    // Complete: the identity header and every populated section are on it.
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Northwind Payments")).toBeInTheDocument();
    expect(
      screen.getByText("Cut settlement latency by 40%"),
    ).toBeInTheDocument();
  });

  it("announces the page count once, without taking role=status", () => {
    // `role="status"` is already the CV copy editor's read-only banner on these
    // screens, and a second one breaks every `getByRole("status")` locator.
    const { container } = render(<CvDocumentPreview cv={CV} />);

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe(cvPreviewPageCount(1));
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("wraps every atom in its own measurable box, in document order", () => {
    const { container } = render(<CvDocumentPreview cv={CV} />);

    const keys = Array.from(
      container.querySelectorAll("[data-cv-block]"),
      (element) => element.getAttribute("data-cv-block"),
    );
    expect(keys).toEqual(buildCvDocumentBlocks(CV).map((entry) => entry.key));
  });

  it("keeps the experience bullets inside their entry's own box (AC2)", () => {
    // The unit of a break is the entry, bullets included. If the list were a
    // block of its own the engine would be free to put it on the next sheet.
    const { container } = render(<CvDocumentPreview cv={CV} />);

    const entry = container.querySelector<HTMLElement>(
      '[data-cv-block="experience:e-1"]',
    );
    expect(entry).not.toBeNull();
    expect(
      within(entry!).getByText("Cut settlement latency by 40%"),
    ).toBeInTheDocument();
    expect(within(entry!).getByRole("list")).toBeInTheDocument();
  });
});
