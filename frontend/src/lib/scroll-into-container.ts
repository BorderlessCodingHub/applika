/**
 * Scrolls `element` to the top of its nearest scrollable ancestor, and only
 * that ancestor.
 *
 * `Element.scrollIntoView()` scrolls EVERY scrollable ancestor. In the app
 * shell that includes the `overflow-hidden` root (overflow-hidden boxes are
 * still scrollable by script): once `<main>` hits its end, the leftover
 * offset scrolls the whole shell up, sidebar included, and leaves a blank
 * band under it. Scrolling the one container avoids that.
 */
export function scrollIntoContainer(
  element: HTMLElement,
  behavior: ScrollBehavior = "auto",
): void {
  const container = scrollParent(element);
  if (!container) return;
  // The document's own box moves with its scroll: its viewport top is 0. It
  // honours `scroll-padding-top` (the phone shell's sticky back bar).
  const page = container === document.scrollingElement;
  const top = page ? 0 : container.getBoundingClientRect().top;
  const padding = page
    ? parseFloat(window.getComputedStyle(container).scrollPaddingTop) || 0
    : 0;
  const offset = element.getBoundingClientRect().top - top - padding;
  container.scrollTo({ top: container.scrollTop + offset, behavior });
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  const root = document.scrollingElement ?? document.documentElement;
  return root instanceof HTMLElement ? root : null;
}
