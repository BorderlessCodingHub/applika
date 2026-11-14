import { useEffect, type RefObject } from "react";

/** On mount, take focus only when the step that had it unmounted (focus fell to <body>). */
export function useFocusIfLost(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    ref.current?.focus({ preventScroll: true });
  }, [ref]);
}
