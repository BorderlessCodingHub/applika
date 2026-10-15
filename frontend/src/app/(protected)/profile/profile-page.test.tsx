import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ProfilePage } from "./profile-page";
import type { User } from "@/services/types/users";

/**
 * KODI-022 (plan 0009, T051/T056/T066, T052/T057/T067) — the profile page's
 * `?account=discord&status=...` outcome handling: each status shows exactly
 * its own notice (exact wording), the user query is invalidated once, and
 * the URL is replaced back to `/profile`.
 *
 * `UserProfileView`/`UserProfileEditForm` are stubbed: this suite is about
 * the page's search-param/notice wiring, not the profile body (covered by
 * `connected-accounts.test.tsx` and the existing profile-view tests).
 */

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const USER: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: "gh1",
  discord: null,
  discord_linked: false,
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

describe("ProfilePage discord link notices", () => {
  it("status=linked shows the linked notice, invalidates the user query and replaces the URL", () => {
    searchParams = new URLSearchParams("account=discord&status=linked");
    const { invalidateSpy } = renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Discord connected. Your reports and feedback will mention you.",
    );
    expect(
      screen.queryByText(
        "This Discord account is linked to another Applika account",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Discord was not connected, try again"),
    ).not.toBeInTheDocument();

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["user", "me"] }),
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/profile");
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("status=conflict shows exactly the conflict notice text and no other notice", () => {
    searchParams = new URLSearchParams("account=discord&status=conflict");
    const { invalidateSpy } = renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This Discord account is linked to another Applika account",
    );
    expect(
      screen.queryByText(
        "Discord connected. Your reports and feedback will mention you.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Discord was not connected, try again"),
    ).not.toBeInTheDocument();
    // T056: a conflict outcome invalidates the user query too, not just "linked".
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["user", "me"] }),
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/profile");
  });

  it("status=error shows exactly the error notice text and no other notice", () => {
    searchParams = new URLSearchParams("account=discord&status=error");
    const { invalidateSpy } = renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Discord was not connected, try again",
    );
    expect(
      screen.queryByText(
        "This Discord account is linked to another Applika account",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Discord connected. Your reports and feedback will mention you.",
      ),
    ).not.toBeInTheDocument();
    // T066: an error outcome invalidates the user query too, not just "linked".
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["user", "me"] }),
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/profile");
  });

  it("renders no notice and does not touch the router with no account/status params", () => {
    renderPage();

    expect(
      screen.queryByText("Discord was not connected, try again"),
    ).not.toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("ignores an unknown status value", () => {
    searchParams = new URLSearchParams("account=discord&status=bogus");
    renderPage();

    expect(screen.getByText("Profile View")).toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("ignores a status for a different account than discord", () => {
    searchParams = new URLSearchParams("account=github&status=linked");
    const { invalidateSpy } = renderPage();

    expect(
      screen.queryByText(
        "Discord connected. Your reports and feedback will mention you.",
      ),
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
