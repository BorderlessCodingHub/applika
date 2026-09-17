import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CycleProvider } from "@/contexts/cycle-context";
import { AppShell } from "./app-shell";
import { FULL_WIDTH_PATHS, isFullWidthPath } from "./content-width";

// The shell's header reaches for the cycle list; nothing here is about that.
vi.mock("@/services/services", () => ({
  services: { cycles: { getCycles: () => Promise.resolve([]) } },
}));

/**
 * The full-width opt-out (KODI-008, AC5).
 *
 * The owner: "also, use the full page width for this page". `AppShell` renders
 * the content container itself, so the opt-out lives beside the shell and is
 * matched on the same `activePath` the nav is matched on — not threaded as a
 * prop through every page.
 *
 * jsdom has no layout engine, so "the CV pages really fill the width" is
 * measured as GEOMETRY in `e2e/cv-builder.spec.ts`, on all three routes. What
 * is pinned here is the rule that makes it true, and that it is scoped to the
 * CV routes and nothing else.
 */

function renderShell(activePath: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CycleProvider>
        <AppShell activePath={activePath} user={null} onLogout={vi.fn()}>
          <p>page content</p>
        </AppShell>
      </CycleProvider>
    </QueryClientProvider>,
  );
}

/** The element `AppShell` wraps the page in. */
function contentContainer(container: HTMLElement): HTMLElement {
  const main = container.querySelector("main");
  const box = main?.firstElementChild as HTMLElement | null;
  if (!box) throw new Error("the shell rendered no content container");
  return box;
}

describe("isFullWidthPath", () => {
  it("claims the three CV editing routes and nothing else", () => {
    expect([...FULL_WIDTH_PATHS]).toEqual([
      "/cvs/new",
      "/cvs/editor",
      "/applications/cv",
    ]);

    for (const path of FULL_WIDTH_PATHS) {
      expect(isFullWidthPath(path), path).toBe(true);
    }
  });

  it("leaves every other signed-in route in the reading column", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/applications",
      "/cvs",
      "/profile",
      "/admin",
    ]) {
      expect(isFullWidthPath(path), path).toBe(false);
    }
  });

  it("tolerates the trailing slash the static export also serves", () => {
    expect(isFullWidthPath("/cvs/new/")).toBe(true);
    expect(isFullWidthPath("/applications/cv/")).toBe(true);
    expect(isFullWidthPath("/")).toBe(false);
  });

  it("does not let a longer path borrow the opt-out by prefix", () => {
    // `/cvs/editor` is exact: a future `/cvs/editor-preview` must not inherit
    // the full width just because it starts the same way.
    expect(isFullWidthPath("/cvs/editorial")).toBe(false);
    expect(isFullWidthPath("/cvs/new/steps")).toBe(false);
  });
});

describe("the shell's content container", () => {
  it("spends the whole shell width on a CV editing route", () => {
    for (const path of FULL_WIDTH_PATHS) {
      const { container, unmount } = renderShell(path);
      const box = contentContainer(container);

      expect(box.className, path).not.toMatch(/\bmax-w-/);
      expect(box.className, path).not.toMatch(/\bmx-auto\b/);
      unmount();
    }
  });

  it("keeps the reading column everywhere else", () => {
    const { container } = renderShell("/applications");
    const box = contentContainer(container);

    expect(box.className).toContain("max-w-6xl");
    expect(box.className).toContain("mx-auto");
  });

  it("is still the only content container: no page renders its own", () => {
    // The opt-out only works because the container is rendered HERE. A page
    // that rendered its own would cap the width again from the inside.
    const { container } = renderShell("/cvs/new");
    const main = container.querySelector("main");

    expect(main?.children).toHaveLength(1);
  });
});
