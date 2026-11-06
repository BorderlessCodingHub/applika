import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RETURN_TO_KEY } from "@/lib/return-to";
import ProtectedLayout from "./layout";

/**
 * KODI-058 (T036): the protected layout's return-to. A signed-out visit to
 * `/device?code=` stores path + query before `router.replace("/login")`; the
 * first authenticated render consumes it once and goes back there. Only a
 * same-origin path (`/x`, never `//host`) is ever followed.
 */

const replace = vi.fn();
let auth = { isAuthenticated: false, isLoading: false };
let currentUser: {
  github_restore: { available: boolean; prompt: boolean };
} | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => window.location.pathname,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ ...auth, user: currentUser, logout: vi.fn() }),
}));

vi.mock("@/hooks/use-features", () => ({
  useMyFeatures: () => ({ features: [] }),
}));

const { Pass } = vi.hoisted(() => ({
  Pass: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/layout/protected-providers", () => ({
  ProtectedProviders: Pass,
}));
vi.mock("@/contexts/supports-context", () => ({ SupportsProvider: Pass }));
vi.mock("@/contexts/cycle-context", () => ({ CycleProvider: Pass }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: Pass }));

function visit(url: string) {
  window.history.replaceState(null, "", url);
}

function renderLayout() {
  return render(
    <ProtectedLayout>
      <p>page</p>
    </ProtectedLayout>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
  currentUser = null;
});

afterEach(() => {
  visit("/");
});

describe("ProtectedLayout return-to", () => {
  it("a signed-out visit to /device stores path + query, then goes to /login", () => {
    auth = { isAuthenticated: false, isLoading: false };
    visit("/device?code=BCDF-GHJK");

    renderLayout();

    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe(
      "/device?code=BCDF-GHJK",
    );
    expect(replace).toHaveBeenCalledWith("/login");
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("a signed-out visit to another protected page stores nothing", () => {
    auth = { isAuthenticated: false, isLoading: false };
    visit("/dashboard");

    renderLayout();

    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("stores nothing while auth is still loading", () => {
    auth = { isAuthenticated: false, isLoading: true };
    visit("/device?code=BCDF-GHJK");

    renderLayout();

    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("once authenticated, consumes it once and goes back to /device with the code", () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    auth = { isAuthenticated: true, isLoading: false };
    visit("/dashboard");

    const { unmount } = renderLayout();

    expect(replace).toHaveBeenCalledWith("/device?code=BCDF-GHJK");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();

    // A second authenticated render (another page) has nothing left to follow.
    unmount();
    replace.mockClear();
    renderLayout();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not navigate when already on the stored target, and still clears it", () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    auth = { isAuthenticated: true, isLoading: false };
    visit("/device?code=BCDF-GHJK");

    renderLayout();

    expect(replace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it.each(["//evil.example/device", "/\\evil.example", "https://evil.example"])(
    "refuses %s and clears it",
    (stored) => {
      window.sessionStorage.setItem(RETURN_TO_KEY, stored);
      auth = { isAuthenticated: true, isLoading: false };
      visit("/dashboard");

      renderLayout();

      expect(replace).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
    },
  );

  it("an authenticated render with nothing stored does not navigate", () => {
    auth = { isAuthenticated: true, isLoading: false };
    visit("/dashboard");

    const { getByText } = renderLayout();

    expect(replace).not.toHaveBeenCalled();
    expect(getByText("page")).toBeInTheDocument();
  });
});

/**
 * ADR-0024: a new Borderless account answers the one-time `/welcome` choice
 * before anything else; the return-to path waits for that answer.
 */
describe("ProtectedLayout welcome prompt", () => {
  it("sends an account with an open prompt to /welcome, keeping the return-to", () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    auth = { isAuthenticated: true, isLoading: false };
    currentUser = { github_restore: { available: true, prompt: true } };
    visit("/dashboard");

    renderLayout();

    expect(replace).toHaveBeenCalledWith("/welcome");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe(
      "/device?code=BCDF-GHJK",
    );
  });

  it("never redirects from /welcome itself", () => {
    auth = { isAuthenticated: true, isLoading: false };
    currentUser = { github_restore: { available: true, prompt: true } };
    visit("/welcome");

    renderLayout();

    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves an account that already answered where it is", () => {
    auth = { isAuthenticated: true, isLoading: false };
    currentUser = { github_restore: { available: true, prompt: false } };
    visit("/dashboard");

    renderLayout();

    expect(replace).not.toHaveBeenCalled();
  });
});
