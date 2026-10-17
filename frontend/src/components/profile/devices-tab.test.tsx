import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { ProfileDevices } from "@/app/(protected)/profile/profile-page";
import { DevicesTab, type DevicesTabProps } from "./devices-tab";
import { formatSessionTime } from "./devices-copy";
import { services } from "@/services/services";
import type { UserSession } from "@/services/types/sessions";

/**
 * KODI-058 (AC2..AC7): the profile's Devices tab. The presentational
 * `DevicesTab` is driven through its spec states 1-9; the last block wires it
 * to the real `use-sessions` hooks (services mocked) to prove the current
 * row's "Sign out" lands on `/login` and a revoke refetches the list.
 */

vi.mock("@/services/services", () => ({
  services: {
    sessions: {
      list: vi.fn(),
      revoke: vi.fn(),
      revokeOthers: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CURRENT: UserSession = {
  id: "101",
  client_type: "web",
  sign_in_method: "github_web",
  device_name: "Chrome on macOS",
  client_label: "Chrome 141 on macOS",
  created_ip: "203.0.113.7",
  last_ip: "203.0.113.9",
  created_at: "2026-10-01T09:00:00Z",
  last_used_at: "2026-10-15T08:30:00Z",
  expires_at: "2026-10-22T08:30:00Z",
  ended_at: null,
  status: "active",
  current: true,
};

const CLI: UserSession = {
  id: "102",
  client_type: "cli",
  sign_in_method: "cli_device",
  device_name: "e2e-laptop",
  client_label: "applika-cli 1.1.0",
  created_ip: null,
  last_ip: null,
  created_at: "2026-10-10T12:00:00Z",
  last_used_at: null,
  expires_at: "2026-11-09T12:00:00Z",
  ended_at: null,
  status: "active",
  current: false,
};

const SIGNED_OUT: UserSession = {
  ...CLI,
  id: "201",
  client_type: "web",
  sign_in_method: "cli_browser",
  device_name: "Firefox on Linux",
  client_label: "Firefox 130 on Linux",
  created_ip: "198.51.100.1",
  last_ip: "198.51.100.2",
  last_used_at: "2026-10-05T10:00:00Z",
  ended_at: "2026-10-06T10:00:00Z",
  status: "signed_out",
};

const REVOKED: UserSession = {
  ...CLI,
  id: "202",
  sign_in_method: "cli_legacy",
  device_name: "old-cli",
  ended_at: "2026-10-07T10:00:00Z",
  status: "revoked",
};

const EXPIRED: UserSession = {
  ...CLI,
  id: "203",
  sign_in_method: "cli_browser",
  device_name: "work-box",
  expires_at: "2026-10-08T10:00:00Z",
  ended_at: null,
  status: "expired",
};

const ALL = [CURRENT, CLI, SIGNED_OUT, REVOKED, EXPIRED];

function renderTab(props: Partial<DevicesTabProps> = {}) {
  const onRevoke = vi.fn();
  const onRevokeOthers = vi.fn();
  const onRetry = vi.fn();
  const all: DevicesTabProps = {
    sessions: ALL,
    onRevoke,
    onRevokeOthers,
    onRetry,
    ...props,
  };
  const view = render(<DevicesTab {...all} />);
  return { ...view, onRevoke, onRevokeOthers, onRetry, props: all };
}

function row(id: string) {
  const node = document.querySelector<HTMLElement>(
    `[data-slot="device-row"][data-session-id="${id}"]`,
  );
  if (!node) throw new Error(`no row ${id}`);
  return node;
}

function activeList() {
  return document.querySelector<HTMLElement>('[data-slot="active-devices"]');
}

function endedList() {
  return document.querySelector<HTMLElement>('[data-slot="ended-devices"]');
}

function signOutOthers() {
  return document.querySelector<HTMLElement>('[data-slot="sign-out-others"]')!;
}

describe("DevicesTab states", () => {
  it("1 loading: a status with 'Loading devices' and no header action", () => {
    renderTab({ sessions: undefined, isLoading: true });

    expect(document.querySelector('[data-slot="devices-tab"]')).toHaveAttribute(
      "data-state",
      "loading",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading devices");
    expect(
      document.querySelector('[data-slot="sign-out-others"]'),
    ).not.toBeInTheDocument();
  });

  it("2 error: an alert with Try again; retrying is aria-disabled + aria-busy", async () => {
    const user = userEvent.setup();
    const { onRetry, rerender, props } = renderTab({
      sessions: undefined,
      isError: true,
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load your devices");
    expect(alert).toHaveTextContent("Check your connection and try again.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<DevicesTab {...props} isRetrying />);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(retry).toHaveAttribute("aria-busy", "true");
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("3 ready: Active then Ended, in server order", () => {
    renderTab();

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Active", "Ended (last 30 days)"]);
    expect(
      within(activeList()!)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Chrome on macOS", "e2e-laptop"]);
    expect(
      within(endedList()!)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Firefox on Linux", "old-cli", "work-box"]);
  });

  it("3 ready: every field of a row, both IPs, granted, last used, expires", () => {
    renderTab();
    const current = within(row("101"));

    const terms = current.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual([
      "Client",
      "How it signed in",
      "IP address",
      "Granted",
      "Last used",
      "Expires",
    ]);
    expect(current.getByText("Chrome 141 on macOS")).toBeInTheDocument();
    expect(current.getByText("GitHub in the browser")).toBeInTheDocument();
    expect(
      row("101").querySelector('[data-slot="device-last-ip"]'),
    ).toHaveTextContent("203.0.113.9");
    expect(
      row("101").querySelector('[data-slot="device-sign-in-ip"]'),
    ).toHaveTextContent("Signed in from 203.0.113.7");
    expect(
      current.getByText(formatSessionTime(CURRENT.created_at)),
    ).toHaveAttribute("dateTime", CURRENT.created_at);
    expect(
      current.getByText(formatSessionTime(CURRENT.last_used_at!)),
    ).toHaveAttribute("dateTime", CURRENT.last_used_at);
    expect(
      current.getByText(formatSessionTime(CURRENT.expires_at)),
    ).toHaveAttribute("dateTime", CURRENT.expires_at);
  });

  it("3 ready: a CLI row with nothing recorded says so", () => {
    renderTab();
    const cli = within(row("102"));

    expect(cli.getByText("applika-cli 1.1.0")).toBeInTheDocument();
    expect(cli.getByText("Approved with a device code")).toBeInTheDocument();
    expect(cli.getByText("Not recorded")).toBeInTheDocument();
    expect(cli.getByText("Sign-in IP not recorded")).toBeInTheDocument();
    expect(cli.getByText("Never")).toBeInTheDocument();
  });

  it("marks only the current row 'This device'", () => {
    renderTab();

    const badges = document.querySelectorAll('[data-slot="this-device"]');
    expect(badges).toHaveLength(1);
    expect(row("101")).toContainElement(badges[0] as HTMLElement);
    expect(badges[0]).toHaveTextContent("This device");
    expect(row("101")).toHaveAttribute("data-current", "true");
    expect(row("102")).not.toHaveAttribute("data-current");
  });

  it("shows the status in words and how an ended row ended", () => {
    renderTab();

    const status = (id: string) =>
      row(id).querySelector('[data-slot="device-status"]');
    expect(status("101")).toHaveTextContent("Active");
    expect(status("102")).toHaveTextContent("Active");
    expect(status("201")).toHaveTextContent("Signed out");
    expect(status("202")).toHaveTextContent("Revoked");
    expect(status("203")).toHaveTextContent("Expired");
    expect(within(row("202")).getByText("Older CLI sign-in")).toBeVisible();
    expect(
      within(row("201")).getByText("Approved in the browser"),
    ).toBeVisible();

    // An ended row says when it ended (ended_at, or expires_at when expired)
    // and offers no action.
    const ended = within(row("201"));
    expect(ended.getAllByRole("term").at(-1)).toHaveTextContent("Ended");
    expect(
      ended.getByText(formatSessionTime(SIGNED_OUT.ended_at!)),
    ).toBeInTheDocument();
    expect(
      within(row("203")).getByText(formatSessionTime(EXPIRED.expires_at)),
    ).toBeInTheDocument();
    for (const id of ["201", "202", "203"]) {
      expect(
        row(id).querySelector('[data-slot="device-action"]'),
      ).not.toBeInTheDocument();
    }
  });

  it("4 empty Active: the empty state", () => {
    renderTab({ sessions: [SIGNED_OUT] });

    expect(screen.getByText("No active devices")).toBeInTheDocument();
    expect(
      screen.getByText("Browsers and CLIs you sign in with appear here."),
    ).toBeInTheDocument();
    expect(activeList()).not.toBeInTheDocument();
    expect(endedList()).toBeInTheDocument();
  });

  it("5 empty Ended: the no-ended line", () => {
    renderTab({ sessions: [CURRENT, CLI] });

    expect(
      screen.getByText("No device has ended in the last 30 days."),
    ).toBeInTheDocument();
    expect(endedList()).not.toBeInTheDocument();
  });

  it("revokes another device only after its confirm; Cancel does nothing", async () => {
    const user = userEvent.setup();
    const { onRevoke } = renderTab();

    const action = within(row("102")).getByRole("button", { name: "Revoke" });
    await user.click(action);
    let dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Revoke access for e2e-laptop?");
    expect(dialog).toHaveTextContent(
      "It is signed out on its next request and has to sign in again to use Applika.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onRevoke).not.toHaveBeenCalled();

    await user.click(action);
    dialog = screen.getByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Revoke access" }),
    );
    expect(onRevoke).toHaveBeenCalledWith(CLI);
  });

  it("the current row's action is 'Sign out' behind its own confirm", async () => {
    const user = userEvent.setup();
    const { onRevoke } = renderTab();

    await user.click(
      within(row("101")).getByRole("button", { name: "Sign out" }),
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Sign out of this device?");
    expect(dialog).toHaveTextContent(
      "You are signed out here right away and taken to the login page.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    expect(onRevoke).toHaveBeenCalledWith(CURRENT);
  });

  it("a pending row is aria-disabled + aria-busy and cannot reopen its confirm", async () => {
    const user = userEvent.setup();
    renderTab({ revokingId: "102" });

    const action = within(row("102")).getByRole("button", { name: "Revoke" });
    expect(action).toHaveAttribute("aria-disabled", "true");
    expect(action).toHaveAttribute("aria-busy", "true");
    await user.click(action);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("6 sign out all other devices: counted confirm, Cancel, then confirm", async () => {
    const user = userEvent.setup();
    const { onRevokeOthers, rerender, props } = renderTab();

    await user.click(signOutOthers());
    let dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Sign out 1 other device?");
    expect(dialog).toHaveTextContent(
      "They are signed out on their next request and have to sign in again. This device stays signed in.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onRevokeOthers).not.toHaveBeenCalled();

    rerender(
      <DevicesTab
        {...props}
        sessions={[CURRENT, CLI, { ...CLI, id: "103", device_name: "ci" }]}
      />,
    );
    await user.click(signOutOthers());
    dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Sign out 2 other devices?");
    await user.click(
      within(dialog).getByRole("button", { name: "Sign out other devices" }),
    );
    expect(onRevokeOthers).toHaveBeenCalledTimes(1);
  });

  it("7 no other active device: the button is aria-disabled, described, and opens nothing", async () => {
    const user = userEvent.setup();
    renderTab({ sessions: [CURRENT, SIGNED_OUT] });

    const button = signOutOthers();
    expect(button).toHaveAttribute("aria-disabled", "true");
    const hint = screen.getByText("No other device is signed in.");
    expect(button).toHaveAttribute("aria-describedby", hint.id);
    await user.click(button);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("8 revoke-others pending: aria-disabled + aria-busy", () => {
    renderTab({ isRevokingOthers: true });

    expect(signOutOthers()).toHaveAttribute("aria-disabled", "true");
    expect(signOutOthers()).toHaveAttribute("aria-busy", "true");
  });

  it("9 a revoked row moves to Ended and focus lands on the Active heading", async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderTab();

    await user.click(
      within(row("102")).getByRole("button", { name: "Revoke" }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Revoke access",
      }),
    );

    rerender(
      <DevicesTab
        {...props}
        sessions={[
          CURRENT,
          { ...CLI, status: "revoked", ended_at: "2026-10-15T09:00:00Z" },
          SIGNED_OUT,
        ]}
      />,
    );

    expect(endedList()).toContainElement(row("102"));
    expect(row("102")).toHaveAttribute("data-status", "revoked");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Active" })).toHaveFocus(),
    );
  });
});

describe("Devices tab wired to the API (use-sessions)", () => {
  const assign = vi.fn();

  function renderWired() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <ProfileDevices />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(services.sessions.list).mockReset();
    vi.mocked(services.sessions.revoke).mockReset();
    vi.mocked(services.sessions.revokeOthers).mockReset();
    assign.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("the current row's Sign out sends DELETE and lands on /login", async () => {
    const user = userEvent.setup();
    vi.mocked(services.sessions.list).mockResolvedValue([CURRENT, CLI]);
    vi.mocked(services.sessions.revoke).mockResolvedValue(undefined);
    renderWired();

    await user.click(
      await within(await waitFor(() => row("101"))).findByRole("button", {
        name: "Sign out",
      }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Sign out",
      }),
    );

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
    expect(services.sessions.revoke).toHaveBeenCalledWith("101");
  });

  it("revoking another device refetches the list and moves it to Ended", async () => {
    const user = userEvent.setup();
    vi.mocked(services.sessions.list)
      .mockResolvedValueOnce([CURRENT, CLI])
      .mockResolvedValueOnce([
        CURRENT,
        { ...CLI, status: "revoked", ended_at: "2026-10-15T09:00:00Z" },
      ]);
    vi.mocked(services.sessions.revoke).mockResolvedValue(undefined);
    renderWired();

    await user.click(
      await within(await waitFor(() => row("102"))).findByRole("button", {
        name: "Revoke",
      }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Revoke access",
      }),
    );

    await waitFor(() =>
      expect(row("102")).toHaveAttribute("data-status", "revoked"),
    );
    expect(services.sessions.revoke).toHaveBeenCalledWith("102");
    expect(services.sessions.list).toHaveBeenCalledTimes(2);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sign out all other devices calls revoke-others and refetches", async () => {
    const user = userEvent.setup();
    vi.mocked(services.sessions.list)
      .mockResolvedValueOnce([CURRENT, CLI])
      .mockResolvedValueOnce([
        CURRENT,
        { ...CLI, status: "revoked", ended_at: "2026-10-15T09:00:00Z" },
      ]);
    vi.mocked(services.sessions.revokeOthers).mockResolvedValue({
      revoked: 1,
    });
    renderWired();

    await waitFor(() => row("102"));
    await user.click(signOutOthers());
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Sign out other devices",
      }),
    );

    await waitFor(() =>
      expect(row("102")).toHaveAttribute("data-status", "revoked"),
    );
    expect(services.sessions.revokeOthers).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("a failed revoke toasts 'Failed to revoke device'", async () => {
    const user = userEvent.setup();
    vi.mocked(services.sessions.list).mockResolvedValue([CURRENT, CLI]);
    vi.mocked(services.sessions.revoke).mockRejectedValue(new Error("boom"));
    renderWired();

    await user.click(
      await within(await waitFor(() => row("102"))).findByRole("button", {
        name: "Revoke",
      }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Revoke access",
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to revoke device"),
    );
  });

  it("a failed load shows the error state, and Try again refetches", async () => {
    const user = userEvent.setup();
    vi.mocked(services.sessions.list)
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce([CURRENT]);
    renderWired();

    const retry = await screen.findByRole("button", { name: "Try again" });
    await user.click(retry);

    await waitFor(() => row("101"));
    expect(services.sessions.list).toHaveBeenCalledTimes(2);
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  async function confirmOn(id: string, action: string, confirm: string) {
    const user = userEvent.setup();
    await user.click(
      await within(await waitFor(() => row(id))).findByRole("button", {
        name: action,
      }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: confirm,
      }),
    );
  }

  it("shows the loading skeleton while the list loads", async () => {
    vi.mocked(services.sessions.list).mockReturnValue(new Promise(() => {}));
    renderWired();

    expect(screen.getByRole("status")).toHaveTextContent("Loading devices");
    expect(screen.queryByText("No active devices")).not.toBeInTheDocument();
  });

  it("a revoke in flight marks its row pending, and only that row", async () => {
    const pending = deferred<void>();
    vi.mocked(services.sessions.list).mockResolvedValue([CURRENT, CLI]);
    vi.mocked(services.sessions.revoke).mockReturnValue(pending.promise);
    renderWired();

    await confirmOn("102", "Revoke", "Revoke access");

    const action = within(row("102")).getByRole("button", { name: "Revoke" });
    await waitFor(() => expect(action).toHaveAttribute("aria-busy", "true"));
    expect(
      within(row("101")).getByRole("button", { name: "Sign out" }),
    ).not.toHaveAttribute("aria-busy");
    pending.resolve();
    await waitFor(() => expect(action).not.toHaveAttribute("aria-busy"));
  });

  it("the current row stays pending after its DELETE, until the page leaves", async () => {
    const pending = deferred<void>();
    vi.mocked(services.sessions.list).mockResolvedValue([CURRENT, CLI]);
    vi.mocked(services.sessions.revoke).mockReturnValue(pending.promise);
    renderWired();

    await confirmOn("101", "Sign out", "Sign out");
    const action = within(row("101")).getByRole("button", { name: "Sign out" });
    await waitFor(() => expect(action).toHaveAttribute("aria-busy", "true"));
    expect(assign).not.toHaveBeenCalled();

    pending.resolve();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
    expect(action).toHaveAttribute("aria-busy", "true");
  });

  it("sign out others in flight is aria-busy; a failure toasts", async () => {
    const pending = deferred<{ revoked: number }>();
    vi.mocked(services.sessions.list).mockResolvedValue([CURRENT, CLI]);
    vi.mocked(services.sessions.revokeOthers).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderWired();

    await waitFor(() => row("102"));
    await user.click(signOutOthers());
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Sign out other devices",
      }),
    );

    await waitFor(() =>
      expect(signOutOthers()).toHaveAttribute("aria-busy", "true"),
    );
    pending.reject(new Error("down"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to revoke device"),
    );
    expect(signOutOthers()).not.toHaveAttribute("aria-busy");
  });

  it("a rate-limited revoke toasts the server's own retry text", async () => {
    vi.mocked(services.sessions.list).mockResolvedValue([CURRENT, CLI]);
    vi.mocked(services.sessions.revoke).mockRejectedValue(
      new AxiosError("429", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 429,
        statusText: "Too Many Requests",
        headers: new AxiosHeaders({ "retry-after": "30" }),
        config: {} as never,
        data: { detail: "Too many requests. Try again in 30 seconds." },
      }),
    );
    renderWired();

    await confirmOn("102", "Revoke", "Revoke access");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Too many requests. Try again in 30 seconds.",
      ),
    );
  });

  it("Try again keeps the error card, aria-busy, while the retry is in flight", async () => {
    const pending = deferred<UserSession[]>();
    vi.mocked(services.sessions.list)
      .mockRejectedValueOnce(new Error("down"))
      .mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    renderWired();

    const retry = await screen.findByRole("button", { name: "Try again" });
    await user.click(retry);

    await waitFor(() => expect(retry).toHaveAttribute("aria-busy", "true"));
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load your devices",
    );

    pending.resolve([CURRENT]);
    await waitFor(() => row("101"));
  });
});
