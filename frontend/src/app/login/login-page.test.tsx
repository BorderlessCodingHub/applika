import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";
import pt from "@/i18n/messages/pt-BR.json";
import { LocaleProvider } from "@/i18n/locale-provider";
import { SIGN_IN_ERROR_CODES } from "@/components/auth/sign-in-screen";
import { RETURN_TO_KEY } from "@/lib/return-to";
import { services } from "@/services/services";
import { mockPhoneViewport } from "@/test/phone";

import { LoginPage, signedInLandingFor } from "./login-page";

/**
 * The sign-in page (ADR-0026; option A at md and up, option C below): one
 * Borderless button per width ("Sign in with Borderless" / "Continue with
 * Borderless") that leaves for the API's `/auth/borderless/login`, the words of
 * every `?error=<code>` the callback sends back (in the active language), the
 * terminal hint on `&cli=1`, and where a signed-in visit lands. No password,
 * code or token is ever asked for or held. Both widths' trees are in the DOM
 * (CSS shows one); jsdom answers `matchMedia` as a desktop, so these cases
 * read the desktop tree (`[data-slot="sign-in-desktop"]`) unless they say
 * otherwise. `sign-in-screen.test.tsx` covers each tree on its own.
 */

const LOGIN_URL = "http://127.0.0.1:8000/api/auth/borderless/login";

const replace = vi.fn();
let searchParams = new URLSearchParams();
type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { github_restore: { available: boolean; prompt: boolean } } | null;
};
let auth: AuthState = { isAuthenticated: false, isLoading: false, user: null };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

vi.mock("@/services/services", () => ({
  services: { auth: { borderlessLoginUrl: vi.fn() } },
}));

const assign = vi.fn();

function renderPage() {
  // The sign-in page's top-right slot holds the language switcher.
  return render(<LoginPage />, { wrapper: LocaleProvider });
}

/** Option A's lead, at md and up. */
const LEAD =
  "Use your Borderless account. Borderless confirms it's you and sends you back here.";

/** The tree the width shows: desktop unless the test mocks a phone. */
function shown(slot: "sign-in-desktop" | "sign-in-phone" = "sign-in-desktop") {
  return document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
}

/** The CTA by its hook: its name reads "Opening Borderless…" while pending. */
function signInButton(
  slot: "sign-in-desktop" | "sign-in-phone" = "sign-in-desktop",
) {
  return shown(slot).querySelector<HTMLButtonElement>(
    'button[data-action="sign-in-borderless"]',
  )!;
}

function errorBox(
  slot: "sign-in-desktop" | "sign-in-phone" = "sign-in-desktop",
) {
  return shown(slot).querySelector<HTMLElement>('[data-slot="sign-in-error"]')!;
}

function signedIn(prompt = false): AuthState {
  return {
    isAuthenticated: true,
    isLoading: false,
    user: { github_restore: { available: true, prompt } },
  };
}

function icuArgs(message: string): string[] {
  return [...message.matchAll(/\{(\w+)/g)].map((match) => match[1]);
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  auth = { isAuthenticated: false, isLoading: false, user: null };
  replace.mockClear();
  assign.mockClear();
  vi.mocked(services.auth.borderlessLoginUrl).mockReset();
  vi.mocked(services.auth.borderlessLoginUrl).mockReturnValue(LOGIN_URL);
  vi.stubGlobal("location", { ...window.location, assign });
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginPage: the Borderless button (AC1, AC22)", () => {
  it("offers one button and no field: no email, no password, no form, no GitHub", () => {
    renderPage();

    const desktop = within(shown());
    expect(
      desktop.getByRole("heading", { level: 1, name: "Sign in to applika" }),
    ).toBeInTheDocument();
    expect(desktop.getByText(LEAD)).toBeInTheDocument();
    expect(
      desktop.getByRole("button", { name: "Sign in with Borderless" }),
    ).toBe(signInButton());
    expect(signInButton()).toHaveAccessibleDescription(LEAD);
    // One CTA per width, nothing else to press.
    expect(
      document.querySelectorAll('button[data-action="sign-in-borderless"]'),
    ).toHaveLength(2);
    expect(
      within(shown("sign-in-phone")).getByRole("button", {
        name: "Continue with Borderless",
      }),
    ).toBe(signInButton("sign-in-phone"));
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GitHub/)).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="auth/github"]')).toBeNull();
  });

  it("links to Borderless to create an account, in a new tab", () => {
    renderPage();

    const link = within(shown()).getByRole("link", {
      name: "Create a Borderless account",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://platform.borderlesscoding.com/sign-up",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleDescription("Opens in a new tab.");
  });

  it("focuses the button when there is no error", () => {
    renderPage();

    expect(signInButton()).toHaveFocus();
    expect(errorBox()).toBeEmptyDOMElement();
  });

  it("leaves for the API's Borderless sign-in and stays pending until the browser leaves", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(signInButton());

    expect(assign).toHaveBeenCalledWith(LOGIN_URL);
    expect(signInButton()).toHaveAttribute("aria-disabled", "true");
    expect(signInButton()).toHaveAttribute("aria-busy", "true");
    expect(
      document.querySelector('[data-slot="sign-in-pending-status"]'),
    ).toHaveTextContent("Opening Borderless…");

    // A second click while leaving does nothing.
    await user.click(signInButton());
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("keeps nothing in the browser's storage (AC12)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(signInButton());

    expect(window.sessionStorage).toHaveLength(0);
    expect(window.localStorage).toHaveLength(0);
  });

  it("starts idle again when Back restores the page from the bfcache", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(signInButton());
    expect(signInButton()).toHaveAttribute("aria-disabled", "true");

    // A normal page show keeps the pending state…
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: false }),
      );
    });
    expect(signInButton()).toHaveAttribute("aria-disabled", "true");

    // …a bfcache restore resets it.
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    expect(signInButton()).not.toHaveAttribute("aria-disabled");
    expect(signInButton()).not.toHaveAttribute("aria-busy");

    await user.click(signInButton());
    expect(assign).toHaveBeenCalledTimes(2);
  });
});

describe("LoginPage at phone width (option C below md)", () => {
  it("focuses the phone tree's button and leaves from it, pending on both", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderPage();

    expect(signInButton("sign-in-phone")).toHaveFocus();
    await user.click(signInButton("sign-in-phone"));

    expect(assign).toHaveBeenCalledWith(LOGIN_URL);
    for (const slot of ["sign-in-phone", "sign-in-desktop"] as const) {
      expect(signInButton(slot)).toHaveAttribute("aria-busy", "true");
      expect(signInButton(slot)).toHaveTextContent("Opening Borderless…");
    }
    await user.click(signInButton("sign-in-phone"));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("focuses the phone tree's alert on ?error=, the cli line inside it", () => {
    mockPhoneViewport();
    searchParams = new URLSearchParams({ error: "AUTH-1046", cli: "1" });
    renderPage();

    const box = errorBox("sign-in-phone");
    expect(box).toHaveTextContent(
      "The sign-in expired or was started in another browser. Start it again",
    );
    expect(box).toHaveTextContent(
      "Return to your terminal and run applika login again.",
    );
    expect(document.activeElement).toBe(box.querySelector(".ph-signin-alert"));
  });
});

describe("LoginPage: ?error=<code> (AC7, AC13, AC21)", () => {
  it.each(SIGN_IN_ERROR_CODES)(
    "%s shows the API's own words, focused",
    (code) => {
      searchParams = new URLSearchParams({ error: code });
      renderPage();

      const words = (en.errors as Record<string, string>)[code];
      expect(words).toBeTruthy();
      expect(errorBox()).toHaveAttribute("data-code", code);
      expect(errorBox()).toHaveTextContent(words);
      expect(within(errorBox()).getByText(words).closest("[tabindex]")).toBe(
        document.activeElement,
      );
      // The button stays right below the words.
      expect(signInButton()).toBeEnabled();
    },
  );

  it.each([
    ["AUTH-1005", "Verify your email on Borderless first"],
    [
      "AUTH-1046",
      "The sign-in expired or was started in another browser. Start it again",
    ],
    [
      "AUTH-1047",
      "Borderless did not complete the sign-in. Try signing in again",
    ],
    [
      "AUTH-1048",
      "Borderless's answer could not be verified. Try signing in again",
    ],
    [
      "AUTH-1049",
      "Your Borderless sign-in has ended. Sign in again with Borderless",
    ],
    ["AUTH-1017", "Borderless is unavailable, try again later"],
    [
      "AUTH-1006",
      "This email belongs to an applika account linked to another Borderless account. Sign in with that Borderless account, or contact support",
    ],
  ])("%s reads %j", (code, words) => {
    searchParams = new URLSearchParams({ error: code });
    renderPage();

    expect(errorBox()).toHaveTextContent(words);
  });

  it("every code it shows has a message with no ICU argument, in both languages", () => {
    for (const code of SIGN_IN_ERROR_CODES) {
      const enWords = (en.errors as Record<string, string>)[code];
      const ptWords = (pt.errors as Record<string, string>)[code];
      expect(enWords, `en ${code}`).toBeTruthy();
      expect(ptWords, `pt-BR ${code}`).toBeTruthy();
      expect(icuArgs(enWords), `en ${code}`).toEqual([]);
      expect(icuArgs(ptWords), `pt-BR ${code}`).toEqual([]);
    }
  });

  it.each([
    "NOPE-0000",
    "AUTH-1009",
    "<img src=x onerror=alert(1)>",
    "errors.AUTH-1005",
  ])(
    "an unlisted code (%j) shows the generic line, never a catalog sentence",
    (code) => {
      searchParams = new URLSearchParams({ error: code });
      renderPage();

      expect(errorBox()).toHaveAttribute("data-code", "unknown");
      expect(errorBox()).toHaveTextContent("Something went wrong");
      expect(errorBox().querySelector("img")).toBeNull();
      // The only images are the two badges, both from the app's own file.
      for (const img of document.querySelectorAll("img")) {
        expect(img).toHaveAttribute("src", "/borderless-logo.png");
      }
    },
  );

  it("an empty ?error= shows nothing", () => {
    searchParams = new URLSearchParams("error=");
    renderPage();

    expect(errorBox()).toBeEmptyDOMElement();
    expect(signInButton()).toHaveFocus();
  });

  it("signs in again from the error with the same button", async () => {
    searchParams = new URLSearchParams({ error: "AUTH-1049" });
    const user = userEvent.setup();
    renderPage();

    await user.click(signInButton());

    expect(assign).toHaveBeenCalledWith(LOGIN_URL);
    // The words stay while the browser leaves.
    expect(errorBox()).toHaveTextContent("Your Borderless sign-in has ended.");
  });
});

describe("LoginPage: &cli=1 (AC21)", () => {
  it("adds the terminal hint under the words, the command in <code>", () => {
    searchParams = new URLSearchParams({ error: "AUTH-1047", cli: "1" });
    renderPage();

    const hint = within(errorBox()).getByText(
      (_text, node) => node?.getAttribute("data-slot") === "sign-in-cli-hint",
    );
    expect(hint).toHaveTextContent(
      "Return to your terminal and run applika login again.",
    );
    expect(within(hint).getByText("applika login").tagName).toBe("CODE");
    expect(errorBox()).toHaveTextContent(
      "Borderless did not complete the sign-in. Try signing in again",
    );
    expect(document.querySelector('[data-slot="sign-in"]')).toHaveAttribute(
      "data-mode",
      "cli",
    );
  });

  it("AUTH-1019 CLI login expired tells the user to run applika login again", () => {
    searchParams = new URLSearchParams({ error: "AUTH-1019", cli: "1" });
    renderPage();

    expect(errorBox()).toHaveTextContent("CLI login expired");
    expect(errorBox()).toHaveTextContent(
      "Return to your terminal and run applika login again.",
    );
  });

  it("keeps the h1 of the web sign-in: the button starts a web sign-in", () => {
    searchParams = new URLSearchParams({ error: "AUTH-1047", cli: "1" });
    renderPage();

    expect(
      within(shown()).getByRole("heading", {
        level: 1,
        name: "Sign in to applika",
      }),
    ).toBeInTheDocument();
    expect(
      within(shown("sign-in-phone")).getByRole("heading", {
        level: 1,
        name: "One account for your whole job search",
      }),
    ).toBeInTheDocument();
  });

  it("stays on screen for a signed-in browser: the words are about the terminal", () => {
    auth = signedIn();
    searchParams = new URLSearchParams({ error: "AUTH-1048", cli: "1" });
    renderPage();

    expect(replace).not.toHaveBeenCalled();
    expect(errorBox()).toHaveTextContent(
      "Borderless's answer could not be verified.",
    );
  });

  it("without &cli=1 there is no terminal hint", () => {
    searchParams = new URLSearchParams({ error: "AUTH-1047" });
    renderPage();

    expect(document.querySelector('[data-slot="sign-in-cli-hint"]')).toBeNull();
  });
});

describe("LoginPage: a signed-in visit (the callback's success)", () => {
  it("goes to the dashboard", () => {
    auth = signedIn();
    renderPage();

    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-slot="sign-in"]')).toBeNull();
  });

  it("follows the stored return-to path once", () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    auth = signedIn();
    renderPage();

    expect(replace).toHaveBeenCalledWith("/device?code=BCDF-GHJK");
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("sends a new account to /welcome, keeping the return-to for its choice", () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    auth = signedIn(true);
    renderPage();

    expect(replace).toHaveBeenCalledWith("/welcome");
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe(
      "/device?code=BCDF-GHJK",
    );
  });

  it("moves on from a stale web error once the browser is signed in", () => {
    auth = signedIn();
    searchParams = new URLSearchParams({ error: "AUTH-1046" });
    renderPage();

    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("waits while the session is still loading", () => {
    auth = { isAuthenticated: false, isLoading: true, user: null };
    renderPage();

    expect(replace).not.toHaveBeenCalled();
    expect(signInButton()).toBeInTheDocument();
  });
});

describe("signedInLandingFor", () => {
  it("is /welcome while the welcome choice is open, without touching the return-to", () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=X");
    expect(
      signedInLandingFor({ github_restore: { available: true, prompt: true } }),
    ).toBe("/welcome");
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe("/device?code=X");
  });

  it("is the return-to path, consumed, else the dashboard", () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=X");
    const answered = { github_restore: { available: true, prompt: false } };
    expect(signedInLandingFor(answered)).toBe("/device?code=X");
    expect(signedInLandingFor(answered)).toBe("/dashboard");
    expect(signedInLandingFor(null)).toBe("/dashboard");
  });
});
