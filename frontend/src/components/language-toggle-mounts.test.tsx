import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/app/login/login-page";
import { CliCodeScreen } from "@/components/cli-code/cli-code-screen";
import {
  LANGUAGE_TOGGLE_ROOT_CLASS,
  LANGUAGE_TOGGLE_VARIANTS,
} from "@/components/language-toggle";
import { LandingHeader } from "@/components/landing/landing-header";
import { Header } from "@/components/layout/header";
import { PhoneLanding } from "@/components/phone/landing/phone-landing";
import { PhonePublicBar } from "@/components/phone/phone-public-bar";
import { LocaleProvider } from "@/i18n/locale-provider";
import type { User } from "@/services/types/users";

/**
 * Where the language switcher is mounted (plan 0019, PRD 0021): the signed-in
 * header, the landing header (md and up; the cookie policy and /cli pages
 * share it), the phone landing's header and the phone public bar (below md:
 * /cookie-policy, /cli), the sign-in page and the terminal code page (one
 * mount each, laid out for both widths). The `default` look everywhere; the
 * `landing` look is ported but mounted nowhere. Every mount puts it right
 * after the theme toggle. Only the phone landing's header shows the flags
 * alone.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));

vi.mock("@/hooks/use-user", () => ({
  useAgenda: () => ({ data: [] }),
}));

vi.mock("@/services/services", () => ({
  services: { auth: { borderlessLoginUrl: vi.fn() } },
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

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider>{children}</LocaleProvider>
    </QueryClientProvider>
  );
}

const DEFAULT_ROOT = `${LANGUAGE_TOGGLE_ROOT_CLASS} ${LANGUAGE_TOGGLE_VARIANTS.default.root}`;

/** The one switcher on screen: default look, EN checked, a sibling of the theme toggle. */
function expectOneDefaultToggle() {
  const groups = screen.getAllByRole("radiogroup", { name: "Toggle language" });
  expect(groups).toHaveLength(1);
  const group = groups[0];
  expect(group).toHaveAttribute("class", DEFAULT_ROOT);
  expect(group.className).not.toContain(LANGUAGE_TOGGLE_VARIANTS.landing.root);
  const english = within(group).getByRole("radio", { name: "English" });
  expect(english).toHaveAttribute("aria-checked", "true");
  expect(english.className).toContain(LANGUAGE_TOGGLE_VARIANTS.default.active);
  const theme = screen.getByRole("button", { name: /toggle theme/i });
  expect(group.parentElement).toBe(theme.parentElement);
  return { group, theme };
}

/** Theme, then language: every mount. */
function expectDefaultToggleAfterTheme() {
  const { group, theme } = expectOneDefaultToggle();
  expect(theme.nextElementSibling).toBe(group);
  return group;
}

describe("LanguageToggle mounts", () => {
  it("the signed-in header holds it, default look, after the theme toggle", () => {
    render(
      <Header
        user={user}
        onLogout={vi.fn()}
        onFeedback={vi.fn()}
        onOpenMobileNav={vi.fn()}
      />,
      { wrapper: Providers },
    );
    expect(expectDefaultToggleAfterTheme()).not.toHaveAttribute(
      "data-flags-only",
    );
    // Inside the z-30 header itself, no portal.
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("radiogroup", { name: "Toggle language" }),
    );
  });

  it("the landing header (and so the cookie policy page) holds it, default look, after the theme toggle", () => {
    render(<LandingHeader />, { wrapper: Providers });
    expect(expectDefaultToggleAfterTheme()).not.toHaveAttribute(
      "data-flags-only",
    );
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("radiogroup", { name: "Toggle language" }),
    );
  });

  it("the sign-in page holds it in its top-right slot, after the theme toggle, outside the form", () => {
    render(<LoginPage />, { wrapper: Providers });
    expectDefaultToggleAfterTheme();
    const group = screen.getByRole("radiogroup", { name: "Toggle language" });
    expect(group.closest("form")).toBeNull();
  });

  it("the terminal code page holds it in its top-right slot, after the theme toggle", () => {
    render(<CliCodeScreen code="abc" state="xyz" />, { wrapper: Providers });
    expectDefaultToggleAfterTheme();
  });

  it("the phone landing's header holds it, default look, flags only, after the theme toggle", () => {
    render(<PhoneLanding />, { wrapper: Providers });
    expect(expectDefaultToggleAfterTheme()).toHaveAttribute(
      "data-flags-only",
      "",
    );
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("radiogroup", { name: "Toggle language" }),
    );
  });

  it("the phone public bar (cookie policy below md) holds it, default look, after the theme toggle", () => {
    render(<PhonePublicBar />, { wrapper: Providers });
    expectDefaultToggleAfterTheme();
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("radiogroup", { name: "Toggle language" }),
    );
  });

  it("no source file mounts the landing look; every mount asks for default", () => {
    const root = resolve(process.cwd(), "src");
    const mounts = readdirSync(root, { recursive: true })
      .map(String)
      .filter(
        (path) =>
          path.endsWith(".tsx") &&
          !path.endsWith(".test.tsx") &&
          !path.endsWith("language-toggle.tsx"),
      )
      .map((path) => [path, readFileSync(join(root, path), "utf8")] as const)
      .filter(([, text]) => text.includes("<LanguageToggle"));
    expect(mounts.map(([path]) => path).sort()).toEqual([
      "components/auth/sign-in-screen.tsx",
      "components/cli-code/cli-code-screen.tsx",
      "components/landing/landing-header.tsx",
      "components/layout/header.tsx",
      "components/phone/landing/phone-landing-header.tsx",
      "components/phone/phone-public-bar.tsx",
    ]);
    for (const [path, text] of mounts) {
      const tags = text.match(/<LanguageToggle\b[^>]*>/g) ?? [];
      // Only the phone landing's header asks for the flags alone.
      expect(tags).toEqual([
        path === "components/phone/landing/phone-landing-header.tsx"
          ? '<LanguageToggle variant="default" flagsOnly />'
          : '<LanguageToggle variant="default" />',
      ]);
    }
  });
});
