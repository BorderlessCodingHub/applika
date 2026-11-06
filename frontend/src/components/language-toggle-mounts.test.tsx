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
import { LocaleProvider } from "@/i18n/locale-provider";
import type { User } from "@/services/types/users";

/**
 * Where the language switcher is mounted (plan 0019): the signed-in header,
 * the landing header (the cookie policy page shares it), the sign-in page and
 * the terminal code page. The `default` look everywhere, right before the
 * theme toggle; the `landing` look is ported but mounted nowhere.
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
  services: { auth: { borderlessSignIn: vi.fn() } },
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

/** The one switcher on screen: default look, EN checked, right before the theme toggle. */
function expectDefaultToggleBeforeTheme() {
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
  expect(group.nextElementSibling).toBe(theme);
}

describe("LanguageToggle mounts", () => {
  it("the signed-in header holds it, default look, before the theme toggle", () => {
    render(
      <Header
        user={user}
        onLogout={vi.fn()}
        onFeedback={vi.fn()}
        onOpenMobileNav={vi.fn()}
      />,
      { wrapper: Providers },
    );
    expectDefaultToggleBeforeTheme();
    // Inside the z-30 header itself, no portal.
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("radiogroup", { name: "Toggle language" }),
    );
  });

  it("the landing header (and so the cookie policy page) holds it, default look", () => {
    render(<LandingHeader />, { wrapper: Providers });
    expectDefaultToggleBeforeTheme();
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("radiogroup", { name: "Toggle language" }),
    );
  });

  it("the sign-in page holds it in its top-right slot, outside the form", () => {
    render(<LoginPage />, { wrapper: Providers });
    expectDefaultToggleBeforeTheme();
    const group = screen.getByRole("radiogroup", { name: "Toggle language" });
    expect(group.closest("form")).toBeNull();
  });

  it("the terminal code page holds it in its top-right slot", () => {
    render(<CliCodeScreen code="abc" state="xyz" />, { wrapper: Providers });
    expectDefaultToggleBeforeTheme();
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
    ]);
    for (const [, text] of mounts) {
      const tags = text.match(/<LanguageToggle\b[^>]*>/g) ?? [];
      expect(tags).toEqual(['<LanguageToggle variant="default" />']);
    }
  });
});
