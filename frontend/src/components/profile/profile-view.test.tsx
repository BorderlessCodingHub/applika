import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserProfileView } from "./profile-view";
import { UserProfileAvatar } from "./sub-components";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";

/**
 * The profile after Borderless sign-in (ADR-0024): the held badge beside the
 * name, the confirm card whenever the access is not active, "Restore data
 * from GitHub" only with no GitHub identity on record, and no connected
 * accounts card.
 */

vi.mock("@/services/services", () => ({
  services: {
    auth: { startGithubRestore: vi.fn(), confirmMembership: vi.fn() },
    users: { deleteMe: vi.fn() },
  },
}));

// Radix loads the image before rendering it; a stand-in exposes the src.
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    <span data-testid="avatar-image" data-src={src} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const ACTIVE = {
  status: "active" as const,
  expires_at: "2026-11-05T00:00:00Z",
  email: "ada@borderless.example",
};
const USER: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: 583231,
  badges: [{ badge: "borderless_psp", granted_at: "2026-10-01T00:00:00Z" }],
  borderless: ACTIVE,
  github_restore: { available: false, prompt: false },
};

const assign = vi.fn();

function renderView(user: User) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UserProfileView user={user} onEditClick={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserProfileView: membership", () => {
  it("shows the held badge beside the name, outside the h1", () => {
    renderView(USER);

    const h1 = screen.getByRole("heading", { level: 1, name: "ada" });
    const chip = screen.getByRole("img", { name: "Borderless PSP member" });
    expect(chip).toHaveTextContent("PSP");
    expect(h1).not.toContainElement(chip);
    expect(
      document.querySelector('[data-slot="confirm-membership-notice"]'),
    ).toBeNull();
  });

  it("shows no chip and no confirm card without a badge while active", () => {
    renderView({ ...USER, badges: [] });

    expect(screen.queryByRole("img", { name: /Borderless/ })).toBeNull();
    expect(
      document.querySelector('[data-slot="confirm-membership-notice"]'),
    ).toBeNull();
  });

  it.each(["expired", "needs_reconnect"] as const)(
    "%s: no chip, the confirm card instead",
    (status) => {
      renderView({ ...USER, borderless: { ...ACTIVE, status } });

      expect(screen.queryByRole("img", { name: /Borderless/ })).toBeNull();
      expect(
        document.querySelector('[data-slot="confirm-membership-notice"]'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: "Sign in again to confirm your membership",
        }),
      ).toBeInTheDocument();
    },
  );

  it("shows the confirm card with no badge too, whenever the access lapsed", () => {
    renderView({
      ...USER,
      badges: [],
      borderless: { ...ACTIVE, status: "expired" },
    });

    expect(
      document.querySelector('[data-slot="confirm-membership-notice"]'),
    ).toBeInTheDocument();
  });
});

describe("UserProfileView: GitHub restore", () => {
  it("offers the restore only with no GitHub identity on record", async () => {
    const url =
      "https://github.com/login/oauth/authorize?scope=read:user&state=n1";
    vi.mocked(services.auth.startGithubRestore).mockResolvedValue({
      authorize_url: url,
    });
    renderView({
      ...USER,
      github_id: null,
      github_restore: { available: true, prompt: false },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Restore data from GitHub" }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith(url));
  });

  it("hides the restore for an account with its GitHub identity", () => {
    renderView(USER);

    expect(
      screen.queryByRole("button", { name: "Restore data from GitHub" }),
    ).toBeNull();
  });

  it("has no connected accounts card", () => {
    renderView(USER);

    expect(screen.queryByText(/connected accounts/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Connect/ })).toBeNull();
  });
});

describe("UserProfileAvatar", () => {
  it("uses the GitHub avatar with a GitHub id", () => {
    render(<UserProfileAvatar user={USER} />);

    expect(screen.getByTestId("avatar-image")).toHaveAttribute(
      "data-src",
      "https://avatars.githubusercontent.com/u/583231?v=4",
    );
  });

  it("shows initials and no GitHub image without one", () => {
    render(
      <UserProfileAvatar
        user={{
          ...USER,
          github_id: null,
          first_name: "Ada",
          last_name: "Lovelace",
        }}
      />,
    );

    expect(screen.queryByTestId("avatar-image")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });
});
