import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/locale-provider";

import { LoginPage } from "./login-page";
import { RETURN_TO_KEY } from "@/lib/return-to";
import { services } from "@/services/services";

/**
 * The Borderless sign-in page (ADR-0024): the server's own words for every
 * refusal, the passwordless hint, the sign-up link, the CLI mode that never
 * auto-redirects and follows `redirect_to`, and where a web sign-in lands.
 */

const replace = vi.fn();
let searchParams = new URLSearchParams();
let auth = { isAuthenticated: false, isLoading: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

vi.mock("@/services/services", () => ({
  services: { auth: { borderlessSignIn: vi.fn() } },
}));

const assign = vi.fn();

function refusal(status: number, data: unknown) {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config: {} as never,
    data,
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LoginPage />
    </QueryClientProvider>,
    // The sign-in page's top-right slot holds the language switcher.
    { wrapper: LocaleProvider },
  );
}

async function signIn(email = "ada@example.com", password = "secret") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

function errorBox() {
  return document.querySelector('[data-slot="sign-in-error"]')!;
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  auth = { isAuthenticated: false, isLoading: false };
  replace.mockClear();
  assign.mockClear();
  vi.mocked(services.auth.borderlessSignIn).mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginPage: the form", () => {
  it("asks for the Borderless email and password, with no GitHub sign-in", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in to applika" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use your Borderless email and password."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.queryByText(/GitHub/)).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="auth/github"]')).toBeNull();
  });

  it("hints that a passwordless Borderless account sets a password first", () => {
    renderPage();

    expect(
      document.querySelector('[data-slot="sign-in-password-hint"]'),
    ).toHaveTextContent(
      "Joined Borderless through another sign-in provider? Set a password on Borderless first, then sign in here.",
    );
  });

  it("links to Borderless to create an account, in a new tab", () => {
    renderPage();

    const link = screen.getByRole("link", {
      name: "Create a Borderless account",
    });
    expect(link).toHaveAttribute("href", "https://borderlesscoding.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("refuses an empty submit without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Enter your Borderless email"),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(services.auth.borderlessSignIn).not.toHaveBeenCalled();
  });

  it("refuses an email over 100 characters", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText("Email"));
    await user.paste(`${"a".repeat(95)}@x.com`);
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Email must be at most 100 characters"),
    ).toBeInTheDocument();
    expect(services.auth.borderlessSignIn).not.toHaveBeenCalled();
  });
});

describe("LoginPage: the server's words", () => {
  // The API's real bodies (docs/error-codes.md): the numbered code, and the
  // English `detail` the `en` messages repeat word for word.
  it.each([
    [401, { detail: "Invalid email or password", code: "AUTH-1004" }],
    [
      403,
      {
        detail: "Verify your email on Borderless first",
        code: "AUTH-1005",
      },
    ],
    [
      409,
      {
        detail:
          "This email belongs to an applika account linked to another Borderless account",
        code: "AUTH-1006",
      },
    ],
    [
      409,
      {
        detail:
          "More than one applika account uses this email; contact support",
        code: "AUTH-1007",
      },
    ],
    [
      422,
      {
        detail:
          "This Borderless email cannot be used with applika: it must be a valid address of at most 100 characters",
        code: "AUTH-1008",
      },
    ],
    [
      429,
      {
        detail: "Too many sign-in attempts. Try again in 42 seconds.",
        code: "AUTH-1009",
        params: { seconds: 42 },
      },
    ],
    [
      503,
      {
        detail: "Borderless is unavailable, try again later",
        code: "AUTH-1017",
      },
    ],
  ])("%i shows the detail word for word", async (status, data) => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(status, data),
    );
    renderPage();

    await signIn();

    await waitFor(() => expect(errorBox()).toHaveTextContent(data.detail));
    expect(errorBox()).not.toHaveTextContent(
      "Run applika login in your terminal again.",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("422 AUTH-1008 is neither the wrong-password nor the rate-limit wording", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(422, {
        detail:
          "This Borderless email cannot be used with applika: it must be a valid address of at most 100 characters",
        code: "AUTH-1008",
      }),
    );
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent("cannot be used with applika"),
    );
    expect(errorBox()).not.toHaveTextContent("Invalid email or password");
    expect(errorBox()).not.toHaveTextContent("Too many");
  });

  it("a validation 422 (GEN-1003) shows its one line, never the field list", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(422, {
        detail: [{ loc: ["body", "email"], msg: "x" }],
        code: "GEN-1003",
      }),
    );
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent(
        "Some fields are not valid. Check them and try again.",
      ),
    );
    expect(errorBox()).not.toHaveTextContent("[object Object]");
  });

  it("a code the web does not know shows the API's detail", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(409, { detail: "A brand new refusal", code: "AUTH-9999" }),
    );
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent("A brand new refusal"),
    );
  });

  it("a raw validation 422 gets a fixed line, never an object", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(422, { detail: [{ loc: ["body", "email"], msg: "x" }] }),
    );
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent(
        "Sign-in did not finish. Try again.",
      ),
    );
  });

  it("401 clears the password and focuses it", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(401, { detail: "Invalid email or password" }),
    );
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent("Invalid email or password"),
    );
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("a new submit clears the previous words", async () => {
    vi.mocked(services.auth.borderlessSignIn)
      .mockRejectedValueOnce(
        refusal(503, { detail: "Borderless is unavailable, try again later" }),
      )
      .mockReturnValueOnce(new Promise(() => {}));
    renderPage();

    const user = await signIn();
    await waitFor(() => expect(errorBox()).toHaveTextContent("try again"));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(errorBox()).toBeEmptyDOMElement());
  });
});

describe("LoginPage: the web sign-in", () => {
  it("redirects a signed-in visitor to the dashboard", () => {
    auth = { isAuthenticated: true, isLoading: false };
    renderPage();

    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("lands on the dashboard, holding the button pending until the browser leaves", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockResolvedValue({
      redirect_to: null,
      new_account: false,
    });
    renderPage();

    await signIn();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
    expect(services.auth.borderlessSignIn).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret",
    });
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("follows the stored return-to path once", async () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    vi.mocked(services.auth.borderlessSignIn).mockResolvedValue({
      redirect_to: null,
      new_account: false,
    });
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/device?code=BCDF-GHJK"),
    );
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("sends a new account to /welcome, keeping the return-to for its choice", async () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    vi.mocked(services.auth.borderlessSignIn).mockResolvedValue({
      redirect_to: null,
      new_account: true,
    });
    renderPage();

    await signIn();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/welcome"));
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe(
      "/device?code=BCDF-GHJK",
    );
  });
});

describe("LoginPage: ?cli=1", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("cli=1");
  });

  it("never auto-redirects a signed-in visitor and always asks for the password", () => {
    auth = { isAuthenticated: true, isLoading: false };
    renderPage();

    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in to applika-cli" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="sign-in-cli-note"]'),
    ).toHaveTextContent(
      "This sign-in completes applika login in your terminal.",
    );
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("follows redirect_to back to the terminal", async () => {
    const redirect = "http://127.0.0.1:53682/callback?code=abc&state=xyz";
    vi.mocked(services.auth.borderlessSignIn).mockResolvedValue({
      redirect_to: redirect,
      new_account: false,
    });
    renderPage();

    await signIn();

    await waitFor(() => expect(assign).toHaveBeenCalledWith(redirect));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("400 AUTH-1019 CLI login expired tells the user to run applika login again", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(400, { detail: "CLI login expired", code: "AUTH-1019" }),
    );
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent("CLI login expired"),
    );
    expect(errorBox()).toHaveTextContent(
      "Run applika login in your terminal again.",
    );
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("LoginPage: ?cli=1 after the terminal's marker lapsed", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("cli=1");
  });

  it("says the terminal sign-in expired instead of leaving silently", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockResolvedValue({
      redirect_to: null,
      new_account: false,
    });
    renderPage();

    await signIn();

    await waitFor(() =>
      expect(errorBox()).toHaveTextContent(
        "The terminal sign-in expired before you signed in.",
      ),
    );
    expect(errorBox()).toHaveTextContent(
      "Run applika login in your terminal again.",
    );
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });
});
