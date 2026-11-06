import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ProfilePage } from "./profile-page";
import type { User } from "@/services/types/users";
import { GITHUB_RESTORE_NOTICE_COPY } from "@/components/profile/github-restore-copy";

/**
 * The GitHub restore outcome (`?account=github&status=…`, ADR-0024): each
 * status shows exactly its own words, the user is refetched once, and the URL
 * goes back to `/profile`. `UserProfileView` is stubbed: this suite is about
 * the page's search-param and notice wiring.
 */

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const USER: User = {
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
  github_restore: { available: true, prompt: false },
};

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: USER }),
}));

vi.mock("@/hooks/use-statistics", () => ({
  useGeneralStats: () => ({ data: undefined }),
}));

vi.mock("@/components/profile/profile-view", () => ({
  UserProfileView: () => <div>Profile View</div>,
}));

vi.mock("@/services/services", () => ({
  services: {
    sessions: {
      list: vi.fn().mockResolvedValue([]),
      revoke: vi.fn(),
      revokeOthers: vi.fn(),
    },
  },
}));

vi.mock("@/components/profile/edit-form", () => ({
  UserProfileEditForm: () => <div>Edit Form</div>,
}));

function renderPage() {
  const client = new QueryClient();
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ProfilePage />
    </QueryClientProvider>,
  );
  return { invalidateSpy };
}

const replaceState = vi.fn();

beforeEach(() => {
  searchParams = new URLSearchParams();
  replaceState.mockClear();
  vi.spyOn(window.history, "replaceState").mockImplementation(replaceState);
});

const ALERTS = ["not_found", "has_data", "already_bound", "error"] as const;

describe("ProfilePage GitHub restore notices", () => {
  it("status=restored shows the restored notice, refetches and replaces the URL", () => {
    searchParams = new URLSearchParams("account=github&status=restored");
    const { invalidateSpy } = renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your old applika account is restored. It signs in with Borderless from now on.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The browser is now the old account: everything cached is refetched.
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/profile");
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it.each(ALERTS)(
    "status=%s shows exactly its own alert and refetches the user",
    (status) => {
      searchParams = new URLSearchParams(`account=github&status=${status}`);
      const { invalidateSpy } = renderPage();

      expect(screen.getByRole("alert")).toHaveTextContent(
        GITHUB_RESTORE_NOTICE_COPY[status],
      );
      for (const other of ALERTS.filter((s) => s !== status)) {
        expect(
          screen.queryByText(GITHUB_RESTORE_NOTICE_COPY[other]),
        ).not.toBeInTheDocument();
      }
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["user", "me"] }),
      );
      expect(replaceState).toHaveBeenCalledWith(null, "", "/profile");
    },
  );

  it("has_data explains that two accounts that both hold data are not merged", () => {
    searchParams = new URLSearchParams("account=github&status=has_data");
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "two accounts that both hold data are not merged",
    );
  });

  it("not_found tells the user no old account was found", () => {
    searchParams = new URLSearchParams("account=github&status=not_found");
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No old applika account was found for this GitHub account.",
    );
  });

  it("dismisses the notice", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("account=github&status=not_found");
    renderPage();

    await user.click(screen.getByRole("button", { name: "Dismiss notice" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders no notice and leaves the URL alone with no account/status params", () => {
    renderPage();

    expect(
      document.querySelector('[data-slot="github-restore-notice"]'),
    ).not.toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("ignores an unknown status value", () => {
    searchParams = new URLSearchParams("account=github&status=bogus");
    renderPage();

    expect(screen.getByText("Profile View")).toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("ignores an outcome for another account", () => {
    searchParams = new URLSearchParams("account=other&status=restored");
    const { invalidateSpy } = renderPage();

    expect(
      document.querySelector('[data-slot="github-restore-notice"]'),
    ).not.toBeInTheDocument();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

/**
 * KODI-058 (AC2, AC8): "Profile" (today's content) and "Devices" tabs, side
 * by side, for every user — no feature gate. `?tab=devices` (the `/device`
 * page's "See your devices") opens Devices.
 */
describe("ProfilePage tabs", () => {
  it("shows Profile and Devices tabs, Profile selected with today's content", () => {
    renderPage();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Profile", "Devices"]);
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Profile View")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="devices-tab"]'),
    ).not.toBeInTheDocument();
  });

  it("the Devices tab shows the device list", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: "Devices" }));

    expect(screen.getByRole("tab", { name: "Devices" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText("Profile View")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("No active devices")).toBeInTheDocument(),
    );
  });

  it("?tab=devices opens the Devices tab", () => {
    searchParams = new URLSearchParams("tab=devices");
    renderPage();

    expect(screen.getByRole("tab", { name: "Devices" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      document.querySelector('[data-slot="devices-tab"]'),
    ).toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("an unknown ?tab= falls back to Profile", () => {
    searchParams = new URLSearchParams("tab=bogus");
    renderPage();

    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
