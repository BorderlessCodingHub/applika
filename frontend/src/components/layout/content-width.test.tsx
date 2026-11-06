import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/locale-provider";

import { CycleProvider } from "@/contexts/cycle-context";
import { AppShell } from "./app-shell";
import {
  FULL_WIDTH_PATHS,
  FullWidthContent,
  isFullWidthPath,
} from "./content-width";

// The shell's header reaches for the cycle list; nothing here is about that.
vi.mock("@/services/services", () => ({
  services: { cycles: { getCycles: () => Promise.resolve([]) } },
}));

/**
 * The full-width opt-out (KODI-008, revised KODI-017, AC1).
 *
 * The owner: "also, use the full page width for this page" (KODI-008), then
 * "only full width when we have a cv copy to the application" (KODI-017).
 * `AppShell` renders the content container itself, so the opt-out lives
 * beside the shell in two forms: by PATH (`/cvs/new`, `/cvs/editor`, full
 * width in every state) and by CONTENT (`FullWidthContent`, mounted by
 * `/applications/cv` only from its editor branch).
 *
 * jsdom has no layout engine, so "the CV pages really fill the width" is
 * measured as GEOMETRY in `e2e/cv-builder.spec.ts`. What is pinned here is
 * the rule that makes it true.
 */

function renderShell(
  activePath: string,
  children: React.ReactNode = <p>page content</p>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CycleProvider>
        <AppShell activePath={activePath} user={null} onLogout={vi.fn()}>
          {children}
        </AppShell>
      </CycleProvider>
    </QueryClientProvider>,
    // The shell header holds the language switcher.
    { wrapper: LocaleProvider },
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
  it("claims the two CV editing routes and nothing else", () => {
    expect([...FULL_WIDTH_PATHS]).toEqual(["/cvs/new", "/cvs/editor"]);

    for (const path of FULL_WIDTH_PATHS) {
      expect(isFullWidthPath(path), path).toBe(true);
    }
  });

  it("leaves every other signed-in route in the reading column, including /applications/cv by default", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/applications",
      "/applications/cv",
      "/cvs",
      "/profile",
      "/admin",
    ]) {
      expect(isFullWidthPath(path), path).toBe(false);
    }
  });

  it("tolerates the trailing slash the static export also serves", () => {
    expect(isFullWidthPath("/cvs/new/")).toBe(true);
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
      expect(box.dataset.width, path).toBe("full");
      unmount();
    }
  });

  it("keeps the reading column everywhere else", () => {
    const { container } = renderShell("/applications");
    const box = contentContainer(container);

    expect(box.className).toContain("max-w-7xl");
    expect(box.className).toContain("mx-auto");
    expect(box.dataset.width).toBe("reading");
  });

  it("is still the only content container: no page renders its own", () => {
    // The opt-out only works because the container is rendered HERE. A page
    // that rendered its own would cap the width again from the inside.
    const { container } = renderShell("/cvs/new");
    const main = container.querySelector("main");

    expect(main?.children).toHaveLength(1);
  });

  it("keeps /applications/cv in the reading column when nothing asks for the width", () => {
    const { container } = renderShell("/applications/cv");
    const box = contentContainer(container);

    expect(box.className).toContain("max-w-7xl");
    expect(box.className).toContain("mx-auto");
    expect(box.dataset.width).toBe("reading");
  });

  it("spends the whole width on /applications/cv once FullWidthContent mounts", () => {
    const { container } = renderShell(
      "/applications/cv",
      <>
        <FullWidthContent />
        <p>the editor</p>
      </>,
    );
    const box = contentContainer(container);

    expect(box.className).not.toMatch(/\bmax-w-/);
    expect(box.className).not.toMatch(/\bmx-auto\b/);
    expect(box.dataset.width).toBe("full");
  });

  it("returns to the reading column once FullWidthContent unmounts", () => {
    const { container, rerender } = render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CycleProvider>
          <AppShell
            activePath="/applications/cv"
            user={null}
            onLogout={vi.fn()}
          >
            <FullWidthContent />
          </AppShell>
        </CycleProvider>
      </QueryClientProvider>,
      { wrapper: LocaleProvider },
    );
    expect(contentContainer(container).dataset.width).toBe("full");

    rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CycleProvider>
          <AppShell
            activePath="/applications/cv"
            user={null}
            onLogout={vi.fn()}
          >
            <p>picker</p>
          </AppShell>
        </CycleProvider>
      </QueryClientProvider>,
    );
    expect(contentContainer(container).dataset.width).toBe("reading");
  });

  it("is a no-op outside AppShell: FullWidthContent alone renders nothing and throws nothing", () => {
    expect(() => render(<FullWidthContent />)).not.toThrow();
  });
});
