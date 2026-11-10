import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Header } from "@/components/layout/header";
import { LocaleProvider } from "@/i18n/locale-provider";
import type { User } from "@/services/types/users";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The signed-in header at md and up, in the owner's order: the cycle selector
 * (`leading`) at the left; at the right the agenda button, the theme toggle,
 * then the language toggle. Page actions sit before the agenda, and the
 * avatar menu (`md:hidden`) stays last. Below md a signed-in page has no
 * header (the phone shell).
 */

vi.mock("@/hooks/use-user", () => ({
  useAgenda: () => ({ data: [] }),
}));

const user: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: 1,
  badges: [],
  borderless: null,
  github_restore: { available: false, prompt: false },
};

const header = (
  <Header
    user={user}
    onLogout={vi.fn()}
    onFeedback={vi.fn()}
    onOpenMobileNav={vi.fn()}
    leading={<button type="button">Cycle 2026</button>}
    actions={<button type="button">Page action</button>}
  />
);

/** Every control of the header at md and up (md:hidden ones dropped), in DOM order. */
function desktopControls(banner: HTMLElement) {
  return Array.from(
    banner.querySelectorAll<HTMLElement>("a, button, [role='radio']"),
  ).filter((node) => !node.closest(".md\\:hidden"));
}

function expectOrder(words: {
  agenda: RegExp;
  theme: string;
  language: string;
}) {
  const banner = screen.getByRole("banner");
  const cycle = within(banner).getByRole("button", { name: "Cycle 2026" });
  const action = within(banner).getByRole("button", { name: "Page action" });
  const agenda = within(banner).getByRole("button", { name: words.agenda });
  const theme = within(banner).getByRole("button", { name: words.theme });
  const group = within(banner).getByRole("radiogroup", {
    name: words.language,
  });
  const [english, portuguese] = within(group).getAllByRole("radio");

  expect(desktopControls(banner)).toEqual([
    cycle,
    action,
    agenda,
    theme,
    english,
    portuguese,
  ]);
  // The cycle selector's slot is left of the right-hand group (ml-auto).
  const right = theme.parentElement!;
  expect(right).toHaveClass("ml-auto");
  expect(right).not.toContainElement(cycle);
  expect(
    cycle.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  // Agenda, theme, language are siblings in that order; the avatar stays last.
  expect(theme.nextElementSibling).toBe(group);
  expect(group.nextElementSibling).toHaveClass("md:hidden");
  expect(right.lastElementChild).toBe(group.nextElementSibling);
  expect(right).toContainElement(agenda);
  // The switcher keeps its text at md and up (no flags-only here).
  expect(group).not.toHaveAttribute("data-flags-only");
  expect(english).toHaveTextContent("EN");
  expect(portuguese).toHaveTextContent("BR");
}

describe("Header: the signed-in order at md and up", () => {
  it("cycle selector left; agenda, theme, language right (English)", () => {
    render(header, { wrapper: LocaleProvider });
    expectOrder({
      agenda: /^Upcoming steps/,
      theme: "Toggle theme",
      language: "Toggle language",
    });
  });

  it("the same order in Portuguese", async () => {
    await renderInPortuguese(header, { localeSwitch: true });
    expectOrder({
      agenda: /^Próximas etapas/,
      theme: "Alternar tema",
      language: "Alternar idioma",
    });
  });
});
