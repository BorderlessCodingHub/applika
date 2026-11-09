import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import AccountRoute from "@/app/(protected)/account/page";
import InsightsRoute from "@/app/(protected)/insights/page";
import { AppShell } from "@/components/layout/app-shell";
import { navItemsFor } from "@/components/layout/nav";
import { CycleProvider, useCycleContext } from "@/contexts/cycle-context";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import { LocaleProvider } from "@/i18n/locale-provider";
import type { MyFeature } from "@/services/types/features";
import type { UserSession } from "@/services/types/sessions";
import type { User } from "@/services/types/users";
import { mockPhoneViewport } from "@/test/phone";

const { logout, setTheme, replace, fetchReports, listSessions, theme } =
  vi.hoisted(() => ({
    logout: vi.fn(() => Promise.resolve()),
    setTheme: vi.fn(),
    replace: vi.fn(),
    fetchReports: vi.fn(),
    listSessions: vi.fn(),
    theme: { resolved: "dark" as string | undefined },
  }));

let currentUser: User | null = null;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: currentUser, logout }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: theme.resolved, setTheme }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/account",
}));

vi.mock("@/services/services", () => ({
  services: {
    cycles: {
      getCycles: () =>
        Promise.resolve([
          {
            id: "c2",
            name: "Fall 2026",
            created_at: "2026-09-01",
            updated_at: null,
          },
        ]),
    },
    sessions: { list: () => listSessions() },
    reports: { fetchReports: (...args: unknown[]) => fetchReports(...args) },
    users: { getAgenda: () => Promise.resolve([]) },
  },
}));

const SAM: User = {
  id: "u1",
  username: "scarter",
  email: "sam@example.com",
  first_name: "Sam",
  last_name: "Carter",
  github_id: null,
  badges: [{ badge: "borderless_base", granted_at: "2026-10-01" }],
  borderless: { status: "active", email: "sam@example.com", checked_at: null },
  github_restore: { available: false, prompt: false },
};

const BOTH: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "beta" },
];

function session(status: UserSession["status"], id: string): UserSession {
  return {
    id,
    client_type: "web",
    sign_in_method: "borderless",
    device_name: id,
    client_label: id,
    created_ip: null,
    last_ip: null,
    created_at: "2026-11-01T00:00:00Z",
    last_used_at: null,
    expires_at: "2026-12-01T00:00:00Z",
    ended_at: null,
    status,
    current: false,
  };
}

function PickCycle() {
  const { setSelectedCycleId } = useCycleContext();
  return (
    <button type="button" onClick={() => setSelectedCycleId("c2")}>
      pick past cycle
    </button>
  );
}

function renderAccount({
  user = SAM,
  features = BOTH,
  path = "/account",
  page = <AccountRoute />,
}: {
  user?: User;
  features?: MyFeature[];
  path?: string;
  page?: React.ReactNode;
} = {}) {
  currentUser = user;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // `useHoldsReportsBadge` reads the cached user, as in the app.
  client.setQueryData(USER_QUERY_KEY, user);
  const navItems = (f: MyFeature[], u: User) =>
    navItemsFor(u.is_admin, f, { hasReportsBadge: u.badges.length > 0 });
  const tree = (f: MyFeature[], u: User) => (
    <QueryClientProvider client={client}>
      <CycleProvider>
        <AppShell
          activePath={path}
          navItems={navItems(f, u)}
          user={u}
          onLogout={vi.fn()}
        >
          {page}
          <PickCycle />
        </AppShell>
      </CycleProvider>
    </QueryClientProvider>
  );
  const result = render(tree(features, user), { wrapper: LocaleProvider });
  return {
    ...result,
    rerenderWith: (f: MyFeature[]) => result.rerender(tree(f, user)),
  };
}

const workspace = () => screen.getByRole("region", { name: "Workspace" });
const accountGroup = () => screen.getByRole("region", { name: "Account" });

beforeEach(() => {
  logout.mockClear();
  setTheme.mockClear();
  replace.mockClear();
  fetchReports.mockReset();
  fetchReports.mockResolvedValue({
    reports: [],
    current_day: 5,
    current_phase: 1,
    start_date: "2026-11-01",
  });
  listSessions.mockReset();
  listSessions.mockResolvedValue([
    session("active", "a"),
    session("active", "b"),
    session("revoked", "c"),
  ]);
  theme.resolved = "dark";
});

describe("AccountScreen", () => {
  it("heads the hub with the name, the initials, the badge and View profile", () => {
    mockPhoneViewport();
    renderAccount();

    expect(
      screen.getByRole("heading", { level: 1, name: "Sam Carter" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="phone-account"]'),
    ).toHaveTextContent(/^SC/);
    expect(screen.getByText("Borderless BASE member")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("greets by the username, with its initials, when there is no first name", () => {
    mockPhoneViewport();
    renderAccount({
      user: { ...SAM, first_name: undefined, last_name: "Carter" },
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "scarter" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="phone-account"]'),
    ).toHaveTextContent(/^SC/);
  });

  it("shows one pill per held badge and none while a badge waits for a sign-in", () => {
    mockPhoneViewport();
    const { unmount } = renderAccount({
      user: {
        ...SAM,
        badges: [
          { badge: "borderless_psp", granted_at: "2026-10-01" },
          { badge: "borderless_base", granted_at: "2026-10-01" },
        ],
      },
    });
    expect(screen.getByText("Borderless BASE member")).toBeInTheDocument();
    expect(screen.getByText("Borderless PSP member")).toBeInTheDocument();
    unmount();

    renderAccount({
      user: {
        ...SAM,
        borderless: { ...SAM.borderless!, status: "needs_reconnect" },
      },
    });
    expect(screen.queryByText(/Borderless .* member/)).not.toBeInTheDocument();
  });

  it("lists the workspace with Beta, the report day and the viewed cycle", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderAccount();

    const links = within(workspace()).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/jobs",
      "/cvs",
      "/reports",
      "/cycles",
    ]);
    const jobs = within(workspace()).getByRole("link", { name: "Jobs" });
    expect(jobs).toHaveAccessibleDescription("Beta");
    expect(
      within(workspace()).getByRole("link", { name: "CVs" }),
    ).toHaveAccessibleDescription("Beta");
    await waitFor(() =>
      expect(
        within(workspace()).getByRole("link", { name: "Reports" }),
      ).toHaveAccessibleDescription("Day 5"),
    );
    const cycles = within(workspace()).getByRole("link", { name: "Cycles" });
    expect(cycles).toHaveAccessibleDescription("Current Cycle");

    await user.click(screen.getByRole("button", { name: "pick past cycle" }));
    await waitFor(() =>
      expect(
        within(workspace()).getByRole("link", { name: "Cycles" }),
      ).toHaveAccessibleDescription("Fall 2026"),
    );
  });

  it("lists the account entries with their metas, and no Admin for a user", async () => {
    mockPhoneViewport();
    renderAccount();

    const links = within(accountGroup()).getAllByRole("link");
    expect(links.map((link) => link.textContent?.trim() ?? "")).toEqual([
      "Profile",
      expect.stringContaining("Devices & CLI"),
      expect.stringContaining("Sign in a device"),
    ]);
    expect(
      within(accountGroup()).getByRole("link", { name: "Profile" }),
    ).toHaveAttribute("href", "/profile");
    const devices = within(accountGroup()).getByRole("link", {
      name: "Devices & CLI",
    });
    expect(devices).toHaveAttribute("href", "/profile?tab=devices");
    await waitFor(() =>
      expect(devices).toHaveAccessibleDescription("2 signed in"),
    );
    expect(
      within(accountGroup()).getByRole("link", { name: "Sign in a device" }),
    ).toHaveAccessibleDescription("XXXX-XXXX");
    expect(
      within(accountGroup()).queryByRole("link", { name: "Admin" }),
    ).not.toBeInTheDocument();
  });

  it("lists Admin, meta System, for an admin", () => {
    mockPhoneViewport();
    renderAccount({ user: { ...SAM, is_admin: true } });

    const admin = within(accountGroup()).getByRole("link", { name: "Admin" });
    expect(admin).toHaveAttribute("href", "/admin");
    expect(admin).toHaveAccessibleDescription("System");
  });

  it("shows nothing for a meta while it loads or when it fails", async () => {
    mockPhoneViewport();
    listSessions.mockReturnValue(new Promise(() => {}));
    fetchReports.mockRejectedValue(new Error("down"));
    renderAccount();

    await waitFor(() => expect(fetchReports).toHaveBeenCalled());
    expect(
      within(accountGroup()).getByRole("link", { name: "Devices & CLI" }),
    ).not.toHaveAccessibleDescription();
    expect(
      within(workspace()).getByRole("link", { name: "Reports" }),
    ).not.toHaveAccessibleDescription();
  });

  it("hides a row its feature or badge does not open, and sends no report request", () => {
    mockPhoneViewport();
    renderAccount({
      user: { ...SAM, badges: [], borderless: null },
      features: [{ key: "cvs", stage: "general" }],
    });

    const names = within(workspace())
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(names).toEqual(["/cvs", "/cycles"]);
    expect(
      within(workspace()).getByRole("link", { name: "CVs" }),
    ).not.toHaveAccessibleDescription();
    expect(fetchReports).not.toHaveBeenCalled();
  });

  it("drops a row on the next load once its feature is taken away", () => {
    mockPhoneViewport();
    const { rerenderWith } = renderAccount();
    expect(
      within(workspace()).getByRole("link", { name: "Jobs" }),
    ).toBeInTheDocument();

    rerenderWith([{ key: "cvs", stage: "beta" }]);

    expect(
      within(workspace()).queryByRole("link", { name: "Jobs" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Reports but sends no request while the badge waits for a sign-in, and offers Sign in again", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderAccount({
      user: {
        ...SAM,
        borderless: { ...SAM.borderless!, status: "needs_reconnect" },
      },
    });

    expect(
      within(workspace()).getByRole("link", { name: "Reports" }),
    ).not.toHaveAccessibleDescription();
    expect(fetchReports).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(logout).toHaveBeenCalledWith("/login");
  });

  it("offers Sign in again only while a badge waits for a sign-in", () => {
    mockPhoneViewport();
    renderAccount();

    expect(
      screen.queryByRole("button", { name: "Sign in again" }),
    ).not.toBeInTheDocument();
  });

  it("switches the theme from the Theme choice", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderAccount();

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(within(group).getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(group).getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await user.click(within(group).getByRole("radio", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("checks no theme before next-themes resolves", () => {
    mockPhoneViewport();
    theme.resolved = undefined;
    renderAccount();

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    for (const radio of within(group).getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  it("switches the language in place from the Language choice", async () => {
    mockPhoneViewport();
    onTestFinished(() => {
      document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
      document.documentElement.lang = "en";
    });
    const user = userEvent.setup();
    renderAccount();

    const group = screen.getByRole("radiogroup", { name: "Language" });
    expect(
      within(group).getByRole("radio", { name: "English" }),
    ).toHaveAttribute("aria-checked", "true");

    await user.click(
      within(group).getByRole("radio", { name: "Português (BR)" }),
    );

    expect(
      await screen.findByRole("radiogroup", { name: "Idioma" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Espaço de trabalho" }),
    ).toBeInTheDocument();
    // LocaleProvider sets <html lang> in a passive effect: wait for it.
    await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
  });

  it("opens the feedback dialog from Send feedback", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderAccount();

    const send = screen.getByRole("button", { name: "Send feedback" });
    expect(send).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(send);

    expect(
      await screen.findByRole("dialog", { name: "Rate your experience" }),
    ).toBeInTheDocument();
  });

  it("logs out", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderAccount();

    await user.click(screen.getByRole("button", { name: "Logout" }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith();
  });

  it("links the cookie policy", () => {
    mockPhoneViewport();
    renderAccount();

    expect(screen.getByRole("link", { name: "Cookie policy" })).toHaveAttribute(
      "href",
      "/cookie-policy",
    );
  });
});

describe("the phone-only addresses at md and up", () => {
  it("sends /account to the profile and renders no hub", () => {
    renderAccount();

    expect(replace).toHaveBeenCalledWith("/profile");
    expect(document.querySelector('[data-slot="phone-account"]')).toBeNull();
  });

  it("sends /insights to the dashboard", () => {
    renderAccount({ path: "/insights", page: <InsightsRoute /> });

    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(
      screen.queryByRole("heading", { level: 1, name: "Insights" }),
    ).not.toBeInTheDocument();
  });

  it("leaves when the screen turns past md while the page is open", () => {
    const viewport = mockPhoneViewport();
    renderAccount();
    expect(replace).not.toHaveBeenCalled();

    viewport.setPhone(false);
    expect(replace).toHaveBeenCalledWith("/profile");
  });

  it("shows the Insights title and the initials below md", () => {
    mockPhoneViewport();
    renderAccount({ path: "/insights", page: <InsightsRoute /> });

    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });
});
