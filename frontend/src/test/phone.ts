import { act } from "@testing-library/react";
import { onTestFinished } from "vitest";

import { PHONE_QUERY } from "@/hooks/use-is-phone";

type Listener = (event: MediaQueryListEvent) => void;

export interface PhoneViewport {
  /** Crosses md: `true` below it (the phone), `false` at md and up. */
  setPhone: (phone: boolean) => void;
}

/**
 * Puts `window.matchMedia` on a phone-wide viewport for this test: the phone
 * query (`PHONE_QUERY`) matches and `(min-width: 48rem)` does not; every other
 * query answers `false`, as `src/test/setup.ts` does. `setPhone(false)` rotates
 * the screen past md and fires every `change` listener, inside `act`. The
 * setup's stub comes back when the test finishes.
 */
export function mockPhoneViewport(initial = true): PhoneViewport {
  const original = window.matchMedia;
  let phone = initial;
  const listeners = new Map<string, Set<Listener>>();

  const matches = (query: string) => {
    if (query === PHONE_QUERY) return phone;
    if (query === "(min-width: 48rem)") return !phone;
    return false;
  };

  window.matchMedia = (query: string) => {
    const set = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, set);
    return {
      get matches() {
        return matches(query);
      },
      media: query,
      onchange: null,
      addListener: (listener: Listener) => set.add(listener),
      removeListener: (listener: Listener) => set.delete(listener),
      addEventListener: (_type: string, listener: Listener) =>
        set.add(listener),
      removeEventListener: (_type: string, listener: Listener) =>
        set.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };

  onTestFinished(() => {
    window.matchMedia = original;
  });

  return {
    setPhone(next) {
      phone = next;
      act(() => {
        for (const [query, set] of listeners) {
          const event = { matches: matches(query), media: query };
          for (const listener of [...set]) {
            listener(event as MediaQueryListEvent);
          }
        }
      });
    },
  };
}
