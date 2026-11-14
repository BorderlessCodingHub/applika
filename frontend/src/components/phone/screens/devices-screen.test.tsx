import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "@/app/(protected)/profile/profile-page";
import type { UserSession } from "@/services/types/sessions";
import { setLocation } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  revoke: vi.fn(),
  revokeOthers: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/profile";
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    sessions: {
      list: mocks.list,
      revoke: mocks.revoke,
      revokeOthers: mocks.revokeOthers,
    },
    statistics: { getGeneralStats: () => new Promise(() => {}) },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

// Wednesday 11 November 2026, 09:00 local.
const NOW = new Date(2026, 10, 11, 9, 0);

function session(
  id: string,
  overrides: Partial<UserSession> = {},
): UserSession {
  return {
    id,
    client_type: "web",
    sign_in_method: "borderless",
    device_name: `Device ${id}`,
    client_label: "Browser",
    created_ip: "203.0.113.4",
    last_ip: "203.0.113.4",
    created_at: "2026-11-01T10:00:00Z",
    last_used_at: new Date(2026, 10, 11, 7, 0).toISOString(),
    expires_at: "2026-11-15T10:00:00Z",
    ended_at: null,
    status: "active",
    current: false,
    ...overrides,
  };
}

const HERE = session("s1", {
  device_name: "Chrome on macOS",
  current: true,
});
const CLI = session("s2", {
  client_type: "cli",
  sign_in_method: "cli_device",
  device_name: "e2e-cli",
  last_ip: null,
  last_used_at: null,
});
const ENDED = session("s3", {
  device_name: "Firefox on Linux",
  status: "revoked",
  ended_at: "2026-11-05T10:00:00Z",
});

const originalLocation = window.location;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setLocation("/profile?tab=devices");
  mocks.list.mockReset().mockResolvedValue([HERE, CLI, ENDED]);
  mocks.revoke.mockReset().mockResolvedValue(undefined);
  mocks.revokeOthers.mockReset().mockResolvedValue({ revoked: 1 });
  mocks.assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign: mocks.assign },
  });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

const renderDevices = () => renderPhoneScreen("/profile", <ProfilePage />);

const card = (id: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="device-row"][data-session-id="${id}"]`,
  )!;

describe("Devices below md", () => {
  it("renders the Devices board: each active device, then the ended ones", async () => {
    await renderDevices();

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Active",
    });
    expect(heading).toBeInTheDocument();
    await screen.findByText("Chrome on macOS");

    const here = card("s1");
    expect(here).toHaveAttribute("data-status", "active");
    expect(here).toHaveAttribute("data-current", "true");
    expect(here).toHaveClass("ph-card", "ph-dv-card");
    expect(within(here).getByText("This device")).toBeInTheDocument();
    expect(within(here).getByText("Borderless in the browser")).toBeVisible();
    expect(
      within(here)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["IP address", "Last used", "Expires"]);
    const ip = here.querySelector('[data-slot="device-last-ip"]')!;
    expect(ip).toHaveTextContent("203.0.113.4");
    expect(ip).toHaveClass("ph-mono");
    expect(within(here).getByText("2 hours ago")).toBeInTheDocument();
    expect(within(here).getByText("Nov 15")).toBeInTheDocument();
    expect(within(here).getByRole("button", { name: "Sign out" })).toHaveClass(
      "ph-sec",
    );

    const cli = card("s2");
    expect(cli).not.toHaveAttribute("data-current");
    expect(within(cli).queryByText("This device")).toBeNull();
    expect(cli.querySelector('[data-slot="device-last-ip"]')).toHaveTextContent(
      "Not recorded",
    );
    expect(within(cli).getByText("Never")).toBeInTheDocument();
    expect(
      within(cli).getByRole("button", { name: "Revoke access for e2e-cli" }),
    ).toHaveClass("ph-dan");

    expect(
      screen.getByRole("button", { name: "Sign out all other devices" }),
    ).toHaveAttribute("data-slot", "sign-out-others");

    const ended = screen.getByRole("region", { name: "Ended (last 30 days)" });
    const row = within(ended).getByText("Firefox on Linux").closest("li")!;
    expect(row).toHaveAttribute("data-status", "revoked");
    expect(row).toHaveClass("ph-dv-ended");
    expect(within(row).getByText("Revoked")).toBeInTheDocument();
  });

  it("revokes another device after its sheet; Cancel first, focus back", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    await renderDevices();
    await screen.findByText("e2e-cli");

    const revoke = screen.getByRole("button", {
      name: "Revoke access for e2e-cli",
    });
    await user.click(revoke);
    const sheet = screen.getByRole("alertdialog", {
      name: "Revoke access for e2e-cli?",
    });
    const buttons = within(sheet).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Cancel",
      "Revoke access",
    ]);
    expect(buttons[0]).toHaveFocus();

    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(revoke).toHaveFocus();

    mocks.list.mockResolvedValue([
      HERE,
      { ...CLI, status: "revoked", ended_at: "2026-11-11T09:00:00Z" },
      ENDED,
    ]);
    await user.click(revoke);
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Revoke access",
      }),
    );

    expect(mocks.revoke).toHaveBeenCalledWith("s2");
    await waitFor(() =>
      expect(card("s2")).toHaveAttribute("data-status", "revoked"),
    );
    expect(screen.getByText("No other device is signed in.")).toHaveAttribute(
      "data-slot",
      "no-other-devices",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Active" }),
      ).toHaveFocus(),
    );
  });

  it("signs this device out after its sheet and leaves for /login", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    await renderDevices();
    await screen.findByText("Chrome on macOS");

    await user.click(
      within(card("s1")).getByRole("button", { name: "Sign out" }),
    );
    const sheet = screen.getByRole("alertdialog", {
      name: "Sign out of this device?",
    });
    expect(sheet).toHaveAccessibleDescription(
      "You are signed out here right away and taken to the login page.",
    );
    const confirm = within(sheet).getByRole("button", { name: "Sign out" });
    expect(confirm).toHaveClass("ph-pri");
    await user.click(confirm);

    expect(mocks.revoke).toHaveBeenCalledWith("s1");
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith("/login"));
    // The row stays pending until the page has left.
    expect(
      within(card("s1")).getByRole("button", { name: "Sign out" }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("signs every other device out after its sheet", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    await renderDevices();
    await screen.findByText("e2e-cli");

    await user.click(
      screen.getByRole("button", { name: "Sign out all other devices" }),
    );
    const sheet = screen.getByRole("alertdialog", {
      name: "Sign out 1 other device?",
    });
    await user.click(
      within(sheet).getByRole("button", { name: "Sign out other devices" }),
    );
    expect(mocks.revokeOthers).toHaveBeenCalledOnce();
  });

  it("says when no other device is signed in, and when none has ended", async () => {
    mocks.list.mockResolvedValue([HERE]);
    await renderDevices();

    expect(
      await screen.findByText("No other device is signed in."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign out all other devices" }),
    ).toBeNull();
    expect(
      screen.getByText("No device has ended in the last 30 days."),
    ).toBeInTheDocument();
  });

  it("shows the list loading, then its failure with Retry", async () => {
    vi.useRealTimers();
    let fail: (error: unknown) => void = () => {};
    mocks.list.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const user = userEvent.setup();
    await renderDevices();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading devices");
    expect(
      screen.queryByRole("region", { name: "Ended (last 30 days)" }),
    ).toBeNull();

    fail({ response: { status: 503, data: { detail: "Try later" } } });
    expect(await screen.findByText("Try later")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("e2e-cli")).toBeInTheDocument();
  });
});
