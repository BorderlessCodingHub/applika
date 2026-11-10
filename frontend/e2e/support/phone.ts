import { expect, type Page } from "@playwright/test";

/**
 * A phone in portrait, the size the V2 boards are drawn at (390×844): below
 * the only breakpoint, md (ADR-0027). `playwright.config.ts` ships one
 * Desktop Chrome project, so a phone case sets this viewport itself.
 */
export const PHONE = { width: 390, height: 844 } as const;

/** What a person can press or type into. */
const CONTROLS = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  '[role="button"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
].join(", ");

/**
 * Every control the viewport renders (a box of more than 1px each way:
 * hidden trees are 0×0, sr-only text is 1×1) whose box is under 44px either
 * way, as `"<name> <w>x<h>"`. `count` is how many controls were measured, so
 * a check cannot pass by measuring nothing. A control inside an `exclude`
 * selector is not measured: pass only a named, commented list of today's
 * desktop components a board reuses at their desktop size.
 */
export async function undersizedControls(
  page: Page,
  exclude: readonly string[] = [],
): Promise<{ count: number; small: string[] }> {
  return page.evaluate(
    ({ selector, skip }) => {
      const measured = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      )
        .filter((control) => !skip.some((outside) => control.closest(outside)))
        .map((control) => ({ control, rect: control.getBoundingClientRect() }))
        .filter(
          ({ control, rect }) =>
            rect.width > 1 &&
            rect.height > 1 &&
            getComputedStyle(control).visibility !== "hidden",
        );
      return {
        count: measured.length,
        small: measured
          .filter(({ rect }) => rect.width + 0.5 < 44 || rect.height + 0.5 < 44)
          .map(
            ({ control, rect }) =>
              `${control.getAttribute("aria-label") ?? control.textContent?.trim()} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
          ),
      };
    },
    { selector: CONTROLS, skip: [...exclude] },
  );
}

/**
 * Every control on screen has a 44×44 box (WCAG 2.5.8 AAA target size),
 * except inside `exclude` (see `undersizedControls`).
 */
export async function expectPhoneTargets(
  page: Page,
  atLeast = 1,
  exclude: readonly string[] = [],
) {
  const { count, small } = await undersizedControls(page, exclude);
  expect(count, "controls measured").toBeGreaterThanOrEqual(atLeast);
  expect(small, "controls under 44×44").toEqual([]);
}

/**
 * The page does not scroll sideways: neither the document nor, on a
 * signed-in page, the phone shell's one `<main>` (kept as a guard: it no
 * longer scrolls itself, see `expectDocumentScrolls`). A wide row that
 * scrolls inside its own box (a chip row, a table wrapper) is not sideways
 * scroll.
 */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector("main");
    return {
      document: doc.scrollWidth - doc.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(overflow, "sideways scroll in px").toEqual({ document: 0, main: 0 });
}

/**
 * The signed-in phone shell scrolls the DOCUMENT, never its `<main>`: a
 * mobile browser (Edge and Safari on iOS) collapses its toolbars only on a
 * document scroll. `<main>` is no scroll container; a page taller than the
 * viewport scrolls the document, and the tab bar (when the screen has one)
 * stays pinned to the bottom of the viewport meanwhile.
 */
export async function expectDocumentScrolls(page: Page) {
  const state = await page.evaluate(() => {
    const main = document.querySelector('[data-slot="phone-shell"] main');
    const doc = document.scrollingElement ?? document.documentElement;
    const overflowY = main ? getComputedStyle(main).overflowY : null;
    const tall = doc.scrollHeight > doc.clientHeight;
    window.scrollTo(0, 120);
    const scrolled = window.scrollY;
    const bar = document.querySelector('[data-slot="phone-tab-bar"]');
    const barBottom = bar
      ? window.innerHeight - bar.getBoundingClientRect().bottom
      : null;
    window.scrollTo(0, 0);
    return { overflowY, tall, scrolled, barBottom };
  });
  expect(state.overflowY, "<main> is no scroll container").toBe("visible");
  if (state.tall)
    expect(state.scrolled, "the document scrolls").toBeGreaterThan(0);
  if (state.barBottom !== null)
    expect(state.barBottom, "the tab bar stays on the viewport's bottom").toBe(
      14,
    );
}
