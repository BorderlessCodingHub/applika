import "@testing-library/jest-dom";
import { NextIntlClientProvider } from "next-intl";
import {
  createElement,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import { afterEach, vi } from "vitest";

import en from "@/i18n/messages/en.json";
import { setTranslatorLocale } from "@/i18n/translator";

/*
 * Every component reads its words through next-intl (ADR-0025), so every
 * `render` and `renderHook` gets an English provider around it: the existing
 * word assertions hold because `en` keeps today's exact words. A test's own
 * `wrapper` sits inside it, and a nested `LocaleProvider` overrides it.
 */
function EnglishMessages({ children }: { children: ReactNode }) {
  const props: ComponentProps<typeof NextIntlClientProvider> = {
    locale: "en",
    messages: en,
    timeZone: "UTC",
    children,
  };
  return createElement(NextIntlClientProvider, props);
}

function withEnglish(wrapper?: ComponentType<{ children: ReactNode }>) {
  if (!wrapper) return EnglishMessages;
  const Inner = wrapper;
  return function EnglishAround({ children }: { children: ReactNode }) {
    return createElement(
      EnglishMessages,
      null,
      createElement(Inner, null, children),
    );
  };
}

vi.mock("@testing-library/react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@testing-library/react")>();
  return {
    ...actual,
    render: ((ui, options) =>
      actual.render(ui, {
        ...options,
        wrapper: withEnglish(options?.wrapper),
      })) as typeof actual.render,
    renderHook: ((callback, options) =>
      actual.renderHook(callback, {
        ...options,
        wrapper: withEnglish(options?.wrapper),
      })) as typeof actual.renderHook,
  };
});

// A test that switched the language must not leak it into the next one.
afterEach(() => {
  setTranslatorLocale("en", en);
});

// jsdom implements neither the Pointer Events capture API nor
// `scrollIntoView`, both of which Radix `Select`/`RadioGroup` reach for when
// opening/navigating. Without these stubs, `userEvent.click()` on a Radix
// Select trigger throws inside jsdom (KODI-012, timeline event/interview type
// selects).
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof window.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
