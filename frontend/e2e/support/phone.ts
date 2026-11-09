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
 * a check cannot pass by measuring nothing.
 */
export async function undersizedControls(
  page: Page,
): Promise<{ count: number; small: string[] }> {
  return page.evaluate((selector) => {
    const measured = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    )
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
  }, CONTROLS);
}

/** Every control on screen has a 44×44 box (WCAG 2.5.8 AAA target size). */
export async function expectPhoneTargets(page: Page, atLeast = 1) {
  const { count, small } = await undersizedControls(page);
  expect(count, "controls measured").toBeGreaterThanOrEqual(atLeast);
  expect(small, "controls under 44×44").toEqual([]);
}

/** The page does not scroll sideways. */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "sideways scroll in px").toBeLessThanOrEqual(0);
}
