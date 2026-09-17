import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CycleProvider } from "@/contexts/cycle-context";
import { AppShell } from "./app-shell";

// The shell's header reaches for the cycle list; nothing here is about that.
vi.mock("@/services/services", () => ({
  services: { cycles: { getCycles: () => Promise.resolve([]) } },
}));

/**
 * The containing-block contract behind AC7 (KODI-006).
 *
 * The owner: "When creating a new master CV, remove the page scroll". The
 * cause was not the editor's height. Radix `Select` renders a visually hidden
 * native `<select>` at `position: absolute` for form compatibility — the
 * "Level" control of every language row has one. Every ancestor up to `<body>`
 * was `position: static`, so that element's containing block was the INITIAL
 * containing block: it was left out of `body`'s scrollable overflow, counted
 * in `<html>`'s, and `overflow: hidden` on a static ancestor does not clip an
 * absolutely positioned descendant whose containing block sits outside it. It
 * escaped all three clips and stretched `<html>` to roughly four viewports —
 * a second scrollbar over a page of dead background.
 *
 * `relative` on the shell root gives those descendants a containing block the
 * shell's existing `overflow-hidden` really does clip, and it inoculates the
 * whole signed-in app rather than this one screen: `Select` is also used in
 * the applications filters, the step dialog and the header.
 *
 * jsdom has no layout engine, so the SCROLL is asserted in
 * `e2e/cv-builder.spec.ts` against a real browser. What is pinned here is the
 * contract that makes it true, so nobody drops it in a refactor.
 */

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CycleProvider>
        <AppShell activePath="/cvs/new" user={null} onLogout={vi.fn()}>
          <p>page content</p>
        </AppShell>
      </CycleProvider>
    </QueryClientProvider>,
  );
}

describe("AppShell containing block (AC7)", () => {
  it("positions the shell root, so its own overflow clip actually clips", () => {
    const { container } = renderShell();
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain("relative");
    expect(root.className).toContain("overflow-hidden");
  });

  it("keeps the shell exactly one viewport tall", () => {
    // `h-viewport` subtracts the cookie notice, which `body` adds back as
    // padding — the two are what stop reserving space from introducing a
    // scrollbar. `h-dvh`/`h-screen` would not.
    const { container } = renderShell();
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain("h-viewport");
    expect(root.className).not.toMatch(/\bh-(dvh|screen)\b/);
  });

  it("creates no stacking context, so the z-30/z-40/z-50 contract is untouched", () => {
    const { container } = renderShell();
    const root = container.firstElementChild as HTMLElement;

    // `position: relative` with `z-index: auto` does NOT open a stacking
    // context. A `z-*` class here would, and would trap the Radix portal
    // layer under the shell.
    expect(root.className).not.toMatch(/\bz-\d+\b/);
    expect(root.className).not.toMatch(/\b(isolate|transform|filter)\b/);
  });

  it("still renders the page it wraps", () => {
    renderShell();

    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
