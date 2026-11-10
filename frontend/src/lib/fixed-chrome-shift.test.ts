import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHROME_SHIFT_PROPERTY,
  chromeShift,
  useFixedChromeShift,
} from "./fixed-chrome-shift";

describe("chromeShift", () => {
  it("is the gap between the visible bottom and the fixed anchor (iOS Edge with its toolbar hidden)", () => {
    expect(
      chromeShift({ visibleBottom: 852, anchorBottom: 774, scale: 1 }),
    ).toBe(78);
  });

  it("is 0 when the anchor already sits on the visible bottom (Safari, a desktop)", () => {
    expect(
      chromeShift({ visibleBottom: 844, anchorBottom: 844, scale: 1 }),
    ).toBe(0);
  });

  it("never lifts the chrome: a smaller visible area (the keyboard) is 0", () => {
    expect(
      chromeShift({ visibleBottom: 500, anchorBottom: 844, scale: 1 }),
    ).toBe(0);
  });

  it("is 0 while zoomed in", () => {
    expect(
      chromeShift({ visibleBottom: 900, anchorBottom: 774, scale: 2 }),
    ).toBe(0);
  });

  it("rounds to whole px", () => {
    expect(
      chromeShift({ visibleBottom: 852.4, anchorBottom: 774, scale: 1 }),
    ).toBe(78);
  });
});

describe("useFixedChromeShift", () => {
  const root = document.documentElement;

  afterEach(() => {
    vi.unstubAllGlobals();
    root.style.removeProperty(CHROME_SHIFT_PROPERTY);
  });

  function stubViewport(height: number) {
    const viewport = Object.assign(new EventTarget(), {
      offsetTop: 0,
      height,
      scale: 1,
    });
    vi.stubGlobal("visualViewport", viewport);
    return viewport;
  }

  it("writes the gap on <html> and clears it on unmount, with its probe", () => {
    // jsdom lays nothing out: the probe's top is 0, so the gap is the height.
    stubViewport(78);
    const { unmount } = renderHook(() => useFixedChromeShift());

    expect(root.style.getPropertyValue(CHROME_SHIFT_PROPERTY)).toBe("78px");
    unmount();
    expect(root.style.getPropertyValue(CHROME_SHIFT_PROPERTY)).toBe("");
    expect(document.querySelector('body > div[aria-hidden="true"]')).toBeNull();
  });

  it("writes nothing when there is no gap", () => {
    stubViewport(0);
    renderHook(() => useFixedChromeShift());

    expect(root.style.getPropertyValue(CHROME_SHIFT_PROPERTY)).toBe("");
  });

  it("re-measures on a visual viewport resize", async () => {
    const viewport = stubViewport(0);
    renderHook(() => useFixedChromeShift());

    viewport.height = 60;
    viewport.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(root.style.getPropertyValue(CHROME_SHIFT_PROPERTY)).toBe("60px");
  });
});
