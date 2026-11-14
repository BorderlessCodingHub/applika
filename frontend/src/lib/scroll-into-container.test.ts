import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollIntoContainer } from "./scroll-into-container";

function rect(top: number): DOMRect {
  return { top } as DOMRect;
}

describe("scrollIntoContainer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scrolls only the nearest scrollable ancestor, never the overflow-hidden shell", () => {
    document.body.innerHTML = `
      <div id="shell" style="overflow: hidden">
        <main id="main" style="overflow-y: auto">
          <ul><li id="row"></li></ul>
        </main>
      </div>`;
    const shell = document.getElementById("shell")!;
    const main = document.getElementById("main")!;
    const row = document.getElementById("row")!;
    main.scrollTop = 100;
    vi.spyOn(main, "getBoundingClientRect").mockReturnValue(rect(40));
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(rect(640));
    const mainScroll = vi.fn();
    const shellScroll = vi.fn();
    main.scrollTo = mainScroll;
    shell.scrollTo = shellScroll;

    scrollIntoContainer(row, "smooth");

    expect(mainScroll).toHaveBeenCalledWith({ top: 700, behavior: "smooth" });
    expect(shellScroll).not.toHaveBeenCalled();
  });

  it("falls back to the document scroller when no ancestor scrolls", () => {
    document.body.innerHTML = `<div><p id="row"></p></div>`;
    const row = document.getElementById("row")!;
    const root = (document.scrollingElement ??
      document.documentElement) as HTMLElement;
    const rootScroll = vi.fn();
    root.scrollTo = rootScroll;

    scrollIntoContainer(row);

    expect(rootScroll).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );
  });
});
