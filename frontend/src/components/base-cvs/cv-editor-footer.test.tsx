import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CV_EDITOR_FOOTER_HEIGHT_VAR,
  CvEditorFooter,
} from "./cv-editor-footer";

/**
 * The CV editors' sticky submit row (KODI-009).
 *
 * It is the SECOND bottom-anchored element in the app that reserves its own
 * height, after `CookieConsent`, and it exists because the first one is not
 * enough: the cookie bar is pinned to the VIEWPORT and reserved by `body`,
 * while this row is pinned inside `main` and `body` knows nothing about it. A
 * sticky pane capped at the full scrollport therefore ended UNDER this row, and
 * what ended there was the preview's `<figcaption>` — the layout notice, and
 * the ONLY copy of it on `/cvs/new`.
 *
 * jsdom lays nothing out, so the GEOMETRY is proven in `e2e/cv-builder.spec.ts`
 * by hit-test. What is provable here is the discipline `CookieConsent` set: the
 * property is published while mounted and REMOVED on unmount.
 */

/** The height jsdom is told the footer has; jsdom itself lays nothing out. */
const FOOTER_HEIGHT = 61;

const reserved = () =>
  document.documentElement.style.getPropertyValue(CV_EDITOR_FOOTER_HEIGHT_VAR);

beforeEach(() => {
  document.documentElement.style.removeProperty(CV_EDITOR_FOOTER_HEIGHT_VAR);
  // Every rect is 0x0 in jsdom, which would make a measured reservation
  // indistinguishable from no reservation. Give the row a height.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: FOOTER_HEIGHT,
    width: 1280,
    top: 0,
    left: 0,
    right: 1280,
    bottom: FOOTER_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(CV_EDITOR_FOOTER_HEIGHT_VAR);
});

describe("CvEditorFooter", () => {
  it("renders what it is given", () => {
    render(
      <CvEditorFooter>
        <button type="submit">Save CV</button>
      </CvEditorFooter>,
    );

    expect(screen.getByRole("button", { name: "Save CV" })).toBeInTheDocument();
  });

  it("reserves nothing before it is mounted", () => {
    expect(reserved()).toBe("");
  });

  it("reserves its measured height on the document while it is up", () => {
    render(
      <CvEditorFooter>
        <button type="submit">Save CV</button>
      </CvEditorFooter>,
    );

    expect(reserved()).toBe(`${FOOTER_HEIGHT}px`);
  });

  it("reserves nothing once unmounted — an editor off screen takes no space", () => {
    const { unmount } = render(
      <CvEditorFooter>
        <button type="submit">Save CV</button>
      </CvEditorFooter>,
    );
    expect(reserved()).toBe(`${FOOTER_HEIGHT}px`);

    unmount();

    // Not `0px`: the property is REMOVED, so `max-h-editor-scrollport` falls
    // back to its own `0px` default and collapses to plain `max-h-scrollport`.
    expect(reserved()).toBe("");
  });
});
