import type { BrowserContextOptions, Page } from "@playwright/test";

/**
 * The cookie notice is a card floating over the bottom-right corner of the
 * page, so on a first visit it covers whatever sits there (a sticky submit
 * footer, a card's button) until it is dismissed. A real user dismisses it
 * once and never sees it again; the suite starts every context as that user.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8180";
const ACK_KEY = "applika.cookie-notice-ack";

/** Storage state with the notice already acknowledged on the web origin. */
export const COOKIE_NOTICE_ACKNOWLEDGED: NonNullable<
  BrowserContextOptions["storageState"]
> = {
  cookies: [],
  origins: [
    {
      origin: new URL(BASE_URL).origin,
      localStorage: [{ name: ACK_KEY, value: "1" }],
    },
  ],
};

/**
 * Bring the notice back for a test that is about it: the acknowledgement is
 * removed before every page load in this page's context.
 */
export async function showCookieNotice(page: Page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage blocked: the notice shows anyway.
    }
  }, ACK_KEY);
}
