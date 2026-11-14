import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { WelcomePage } from "./welcome-page";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import { RETURN_TO_KEY } from "@/lib/return-to";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";
import { mockPhoneViewport } from "@/test/phone";

/**
 * The one-time `/welcome` choice (ADR-0024): "Restore your data from GitHub"
 * leaves for GitHub's consent page; "Start fresh" stores the answer and goes
 * on to the return-to path or the dashboard. An account that already
 * answered never sees it again. Below md, v2/Welcome: one radiogroup and one
 * button that follows the choice, on the same calls.
 */

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const NEW_USER: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: null,
  badges: [],
  borderless: {
    status: "active",
    email: "ada@example.com",
    checked_at: "2026-11-06T10:00:00Z",
  },
  github_restore: { available: true, prompt: true },
};
let currentUser: User = NEW_USER;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock("@/services/services", () => ({
  services: {
    auth: { startGithubRestore: vi.fn(), dismissGithubRestore: vi.fn() },
    users: { getMe: vi.fn() },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const assign = vi.fn();

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(USER_QUERY_KEY, currentUser);
  render(
    <QueryClientProvider client={client}>
      <WelcomePage />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  currentUser = NEW_USER;
  replace.mockClear();
  assign.mockClear();
  vi.mocked(services.auth.startGithubRestore).mockReset();
  vi.mocked(services.auth.dismissGithubRestore).mockReset();
  vi.mocked(services.users.getMe).mockResolvedValue({
    ...NEW_USER,
    github_restore: { available: true, prompt: false },
  });
  vi.mocked(toast.error).mockClear();
  vi.stubGlobal("location", { ...window.location, assign });
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WelcomePage", () => {
  it("offers to restore from GitHub or start fresh", () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Used applika with GitHub before?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore your data from GitHub" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start fresh" }),
    ).toBeInTheDocument();
  });

  it("Restore leaves for GitHub's consent page", async () => {
    const url =
      "https://github.com/login/oauth/authorize?client_id=x&scope=read:user&state=n1";
    vi.mocked(services.auth.startGithubRestore).mockResolvedValue({
      authorize_url: url,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Restore your data from GitHub" }),
    );

    await waitFor(() => expect(assign).toHaveBeenCalledWith(url));
    expect(services.auth.dismissGithubRestore).not.toHaveBeenCalled();
    // Both choices stay locked until the browser leaves.
    expect(screen.getByRole("button", { name: "Start fresh" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("Restore drops a stored return-to, so GitHub's outcome stays on the profile", async () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    vi.mocked(services.auth.startGithubRestore).mockResolvedValue({
      authorize_url: "https://github.com/login/oauth/authorize?state=n1",
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Restore your data from GitHub" }),
    );

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("a refused Restore keeps the return-to for Start fresh", async () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    vi.mocked(services.auth.startGithubRestore).mockRejectedValue(
      new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, {
        status: 503,
        statusText: "503",
        headers: new AxiosHeaders(),
        config: {} as never,
        data: { detail: "GitHub restore is not configured" },
      }),
    );
    vi.mocked(services.auth.dismissGithubRestore).mockResolvedValue();
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Restore your data from GitHub" }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Start fresh" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/device?code=BCDF-GHJK"),
    );
  });

  it("Restore unavailable (503) is a toast and both choices come back", async () => {
    vi.mocked(services.auth.startGithubRestore).mockRejectedValue(
      new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, {
        status: 503,
        statusText: "503",
        headers: new AxiosHeaders(),
        config: {} as never,
        data: { detail: "GitHub restore is not configured" },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Restore your data from GitHub" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Restoring from GitHub is unavailable right now",
      ),
    );
    expect(assign).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Start fresh" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("Start fresh stores the answer and goes to the dashboard", async () => {
    vi.mocked(services.auth.dismissGithubRestore).mockResolvedValue();
    const user = userEvent.setup();
    const client = renderPage();

    await user.click(screen.getByRole("button", { name: "Start fresh" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(services.auth.dismissGithubRestore).toHaveBeenCalledTimes(1);
    expect(services.auth.startGithubRestore).not.toHaveBeenCalled();
    // The cached user drops its prompt, so the layout stops sending it back.
    expect(
      client.getQueryData<User>(USER_QUERY_KEY)?.github_restore.prompt,
    ).toBe(false);
  });

  it("Start fresh goes on to the stored return-to path", async () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    vi.mocked(services.auth.dismissGithubRestore).mockResolvedValue();
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Start fresh" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/device?code=BCDF-GHJK"),
    );
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("an account that already answered is sent to the dashboard", () => {
    currentUser = {
      ...NEW_USER,
      github_restore: { available: true, prompt: false },
    };
    renderPage();

    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(
      screen.queryByRole("button", { name: "Start fresh" }),
    ).not.toBeInTheDocument();
  });
});

describe("WelcomePage below md (v2/Welcome)", () => {
  const group = () => screen.getByRole("radiogroup", { name: "How to start" });
  const restoreRadio = () =>
    within(group()).getByRole("radio", { name: "Bring back your old account" });
  const freshRadio = () =>
    within(group()).getByRole("radio", { name: "Start with an empty account" });
  const cta = () =>
    document.querySelector<HTMLElement>(
      '[data-slot="welcome-phone"] button[data-action]',
    )!;

  it("asks once, with restore preselected as the board draws it", () => {
    mockPhoneViewport();
    renderPage();

    const section = document.querySelector('[data-slot="welcome-phone"]');
    expect(section).toHaveClass("ph-app");
    expect(document.querySelector('[data-slot="welcome"]')).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Used applika with GitHub before?",
      }),
    ).toBeInTheDocument();
    expect(within(group()).getAllByRole("radio")).toHaveLength(2);
    expect(restoreRadio()).toBeChecked();
    expect(freshRadio()).not.toBeChecked();
    expect(restoreRadio()).toHaveAccessibleDescription(
      "Its applications, cycles, reports and CVs return, and it signs in with Borderless from now on.",
    );
    expect(cta()).toHaveAttribute("data-action", "restore");
    expect(cta()).toHaveTextContent("Restore your data from GitHub");
    expect(
      document.querySelector('[data-slot="welcome-restore-hint"]'),
    ).toHaveTextContent("GitHub asks you to approve.");
    // One button on screen, for the chosen answer.
    expect(
      screen.queryByRole("button", { name: "Start fresh" }),
    ).not.toBeInTheDocument();
  });

  it("Restore leaves for GitHub's consent page and locks the choice", async () => {
    mockPhoneViewport();
    const url = "https://github.com/login/oauth/authorize?state=n1";
    vi.mocked(services.auth.startGithubRestore).mockResolvedValue({
      authorize_url: url,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Restore your data from GitHub" }),
    );

    await waitFor(() => expect(assign).toHaveBeenCalledWith(url));
    expect(services.auth.dismissGithubRestore).not.toHaveBeenCalled();
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    expect(cta()).toHaveAttribute("aria-busy", "true");
    expect(cta().querySelector("svg.ph-spin")).not.toBeNull();
    expect(restoreRadio()).toBeDisabled();
    expect(freshRadio()).toBeDisabled();
    await user.click(cta());
    expect(services.auth.startGithubRestore).toHaveBeenCalledTimes(1);
  });

  it("picking start fresh turns the button into Start fresh, which stores the answer", async () => {
    mockPhoneViewport();
    vi.mocked(services.auth.dismissGithubRestore).mockResolvedValue();
    const user = userEvent.setup();
    const client = renderPage();

    await user.click(freshRadio());

    expect(freshRadio()).toBeChecked();
    expect(cta()).toHaveAttribute("data-action", "start-fresh");
    expect(cta()).toHaveTextContent("Start fresh");
    expect(
      document.querySelector('[data-slot="welcome-restore-hint"]'),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Start fresh" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(services.auth.dismissGithubRestore).toHaveBeenCalledTimes(1);
    expect(services.auth.startGithubRestore).not.toHaveBeenCalled();
    expect(
      client.getQueryData<User>(USER_QUERY_KEY)?.github_restore.prompt,
    ).toBe(false);
  });

  it("Start fresh goes on to the stored return-to path", async () => {
    mockPhoneViewport();
    window.sessionStorage.setItem(RETURN_TO_KEY, "/device?code=BCDF-GHJK");
    vi.mocked(services.auth.dismissGithubRestore).mockResolvedValue();
    const user = userEvent.setup();
    renderPage();

    await user.click(freshRadio());
    await user.click(cta());

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/device?code=BCDF-GHJK"),
    );
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("while Start fresh is saving the choice is locked and busy", async () => {
    mockPhoneViewport();
    vi.mocked(services.auth.dismissGithubRestore).mockReturnValue(
      new Promise(() => {}),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(freshRadio());
    await user.click(cta());

    await waitFor(() => expect(cta()).toHaveAttribute("aria-busy", "true"));
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    expect(restoreRadio()).toBeDisabled();
    await user.click(cta());
    expect(services.auth.dismissGithubRestore).toHaveBeenCalledTimes(1);
  });

  it("a refused Restore is a toast, and the choice comes back", async () => {
    mockPhoneViewport();
    vi.mocked(services.auth.startGithubRestore).mockRejectedValue(
      new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, {
        status: 503,
        statusText: "503",
        headers: new AxiosHeaders(),
        config: {} as never,
        data: { detail: "GitHub restore is not configured" },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(cta());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Restoring from GitHub is unavailable right now",
      ),
    );
    expect(assign).not.toHaveBeenCalled();
    expect(cta()).not.toHaveAttribute("aria-disabled");
    expect(freshRadio()).toBeEnabled();
  });

  it("an account that already answered is sent to the dashboard", () => {
    mockPhoneViewport();
    currentUser = {
      ...NEW_USER,
      github_restore: { available: true, prompt: false },
    };
    renderPage();

    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(document.querySelector('[data-slot="welcome-phone"]')).toBeNull();
  });
});
