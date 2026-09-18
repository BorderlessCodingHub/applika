import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NOTICE_HEIGHT_VAR, CookieConsent } from "./cookie-consent";

/**
 * The cookie notice (KODI-003 / Task A).
 *
 * Three properties hang off this file:
 *  - it is on screen until the user acknowledges it, and the acknowledgement is
 *    persisted under `applika.cookie-notice-ack`;
 *  - while it is up it RESERVES its own height on the document, so it cannot
 *    cover an in-page `sticky bottom-0` footer — the bug KODI-002's CV editor
 *    footer hit;
 *  - once dismissed it reserves nothing.
 */

const STORAGE_KEY = "applika.cookie-notice-ack";
/** The height jsdom is told the bar has; jsdom itself lays nothing out. */
const BAR_HEIGHT = 96;

const reserved = () =>
  document.documentElement.style.getPropertyValue(COOKIE_NOTICE_HEIGHT_VAR);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.removeProperty(COOKIE_NOTICE_HEIGHT_VAR);
  // jsdom lays nothing out, so every rect is 0x0 and a measured reservation
  // would be indistinguishable from no reservation. Give the bar a height.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: BAR_HEIGHT,
    width: 1280,
    top: 0,
    left: 0,
    right: 1280,
    bottom: BAR_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.style.removeProperty(COOKIE_NOTICE_HEIGHT_VAR);
});

describe("CookieConsent", () => {
  it("renders the notice when it has not been acknowledged", () => {
    render(<CookieConsent />);

    const notice = screen.getByRole("dialog", { name: "Cookie notice" });
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent("We use essential cookies");
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "/cookie-policy",
    );
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss cookie notice" }),
    ).toBeInTheDocument();
  });

  it("stays hidden once the acknowledgement is already stored", () => {
    window.localStorage.setItem(STORAGE_KEY, "1");

    render(<CookieConsent />);

    expect(
      screen.queryByRole("dialog", { name: "Cookie notice" }),
    ).not.toBeInTheDocument();
    expect(reserved()).toBe("");
  });

  it("reserves its measured height on the document while it is up", () => {
    render(<CookieConsent />);

    expect(reserved()).toBe(`${BAR_HEIGHT}px`);
  });

  it("hides, stores the acknowledgement and reserves nothing once dismissed", async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(
      screen.queryByRole("dialog", { name: "Cookie notice" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    // Removed, not zeroed: nothing is left reserving space on the page.
    expect(reserved()).toBe("");
  });

  it("dismisses from the close control too", async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);

    await user.click(
      screen.getByRole("button", { name: "Dismiss cookie notice" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Cookie notice" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    expect(reserved()).toBe("");
  });
});
