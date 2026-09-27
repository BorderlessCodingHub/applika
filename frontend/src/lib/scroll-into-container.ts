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
  const offset =
    element.getBoundingClientRect().top - container.getBoundingClientRect().top;
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
