import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { WelcomePage } from "./welcome-page";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import { RETURN_TO_KEY } from "@/lib/return-to";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";

/**
 * The one-time `/welcome` choice (ADR-0024): "Restore your data from GitHub"
 * leaves for GitHub's consent page; "Start fresh" stores the answer and goes
 * on to the return-to path or the dashboard. An account that already
 * answered never sees it again.
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
    expires_at: "2026-11-05T00:00:00Z",
    email: "ada@example.com",
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
