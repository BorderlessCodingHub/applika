import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminLayout from "@/app/(protected)/admin/layout";
import type { User } from "@/services/types/users";
import { pathname, routerReplace } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  user: { current: null as User | null },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: mocks.user.current,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

beforeEach(() => {
  mocks.user.current = ADMIN;
  routerReplace.mockClear();
});

function renderAdmin(path: string, body = <h1>Users</h1>) {
  pathname.current = path;
  return renderPhoneScreen(path, <AdminLayout>{body}</AdminLayout>, {
    user: mocks.user.current!,
  });
}

const chips = () =>
  within(screen.getByRole("navigation", { name: "Admin sections" }));

describe("the admin header below md", () => {
  it("heads the dashboard with Admin Console, its lead, seven chips and the System pill", async () => {
    await renderAdmin("/admin", <p>dashboard body</p>);

    expect(
      screen.getByRole("heading", { level: 1, name: "Admin Console" }),
    ).toHaveClass("ph-h1");
    expect(
      screen.getByText("Platform-wide analytics and user management"),
    ).toHaveClass("ph-lead");
    const links = chips().getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Dashboard", "/admin"],
      ["Users", "/admin/users"],
      ["Companies", "/admin/companies"],
      ["Platforms", "/admin/platforms"],
      ["Jobs", "/admin/jobs"],
      ["Features", "/admin/features"],
      ["Report webhooks", "/admin/report-webhooks"],
    ]);
    expect(links.every((link) => link.classList.contains("ph-chip"))).toBe(
      true,
    );
    expect(chips().getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      links.filter((link) => link.hasAttribute("aria-current")),
    ).toHaveLength(1);
    expect(
      screen.getByRole("navigation", { name: "Admin sections" }),
    ).toHaveClass("ph-hs", "ph-ad-chips");

    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(within(bar).getByText("System")).toBeInTheDocument();
    // A board route: the page renders straight under the header.
    expect(
      document.querySelector('[data-slot="admin-phone-content"]'),
    ).toBeNull();
  });

  it("marks a section by its prefix: Jobs on /admin/jobs", async () => {
    await renderAdmin("/admin/jobs", <p>jobs body</p>);
    expect(chips().getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      chips().getByRole("link", { name: "Dashboard" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("heading", { level: 1, name: "Admin Console" }),
    ).toBeInTheDocument();
  });

  it("gives a feature's page only the System pill: back Features, no title, lead or chips", async () => {
    await renderAdmin("/admin/features/view", <h1>Job board</h1>);

    expect(
      screen.queryByRole("navigation", { name: "Admin sections" }),
    ).toBeNull();
    expect(
      document.querySelector('[data-slot="admin-phone-header"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-slot="admin-phone-title"]'),
    ).toBeNull();
    expect(screen.queryByText("Admin Console")).toBeNull();
    expect(
      screen.queryByText("Platform-wide analytics and user management"),
    ).toBeNull();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Job board",
    ]);

    const bar = screen.getByRole("banner");
    const back = within(bar).getByRole("link");
    expect(back).toHaveAccessibleName("Features");
    expect(back).toHaveAttribute("href", "/admin/features");
    expect(within(bar).getByText("System")).toBeInTheDocument();
    // A board route: the page renders bare, with its own 20px sides.
    expect(
      document.querySelector('[data-slot="admin-phone-content"]'),
    ).toBeNull();
  });

  it.each([
    [
      "/admin/users",
      "User Management",
      "View, search, and manage all platform users",
      "Users",
    ],
    [
      "/admin/companies",
      "Company Management",
      "Manage companies available on the platform",
      "Companies",
    ],
    [
      "/admin/platforms",
      "Platforms",
      "Manage the platforms users pick for their applications",
      "Platforms",
    ],
    [
      "/admin/features",
      "Features",
      "A new feature starts in beta: only users on its beta list and admins have it. Release it to give it to everyone.",
      "Features",
    ],
    [
      "/admin/report-webhooks",
      "Report webhooks",
      "Each webhook holds one or more badges. A member's biweekly report is posted to every webhook that holds their BASE or PSP badge.",
      "Report webhooks",
    ],
  ])(
    "heads %s with its own title and lead above the chips",
    async (path, title, lead, chip) => {
      await renderAdmin(path, <p>board body</p>);

      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings.map((heading) => heading.textContent)).toEqual([title]);
      expect(headings[0]).toHaveClass("ph-h1", "ph-h1-26");
      expect(headings[0]).toHaveAttribute("data-slot", "admin-phone-title");
      expect(screen.getByText(lead)).toHaveClass("ph-lead");
      expect(screen.queryByText("Admin Console")).toBeNull();
      expect(chips().getByRole("link", { name: chip })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // A board route: the page renders straight under the header.
      expect(
        document.querySelector('[data-slot="admin-phone-content"]'),
      ).toBeNull();
    },
  );

  it("keeps Admin Console at 30px on Dashboard and Jobs only", async () => {
    for (const path of ["/admin", "/admin/jobs"]) {
      const { unmount } = await renderAdmin(path, <p>board body</p>);
      const heading = screen.getByRole("heading", {
        level: 1,
        name: "Admin Console",
      });
      expect(heading).toHaveClass("ph-h1");
      expect(heading).not.toHaveClass("ph-h1-26");
      unmount();
    }
  });

  it.each(["/admin/supports", "/admin/discord-webhooks"])(
    "keeps today's content and its own h1 under the header on %s, a redirect shell with no board",
    async (path) => {
      await renderAdmin(path, <h1>Redirecting</h1>);

      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings.map((heading) => heading.textContent)).toEqual([
        "Redirecting",
      ]);
      const title = document.querySelector('[data-slot="admin-phone-title"]')!;
      expect(title.tagName).toBe("P");
      expect(title).toHaveTextContent("Admin Console");
      expect(title).toHaveClass("ph-h1");
      const content = document.querySelector(
        '[data-slot="admin-phone-content"]',
      )!;
      expect(content).toHaveClass("ph-ad-other");
      expect(content).not.toHaveClass("ph-app");
      expect(content).toContainElement(headings[0]);
      expect(
        screen.getByRole("navigation", { name: "Admin sections" }),
      ).toBeInTheDocument();
    },
  );

  it("shows nothing to someone who is not an administrator", async () => {
    mocks.user.current = { ...SAM, is_admin: false };
    await renderAdmin("/admin", <p>dashboard body</p>);

    expect(
      screen.queryByRole("navigation", { name: "Admin sections" }),
    ).toBeNull();
    expect(screen.queryByText("dashboard body")).toBeNull();
    expect(routerReplace).toHaveBeenCalledWith("/dashboard");
  });

  it("puts today's tab bar back at md and up", () => {
    pathname.current = "/admin";
    const { viewport } = renderPhonePage(
      <AdminLayout>
        <p>dashboard body</p>
      </AdminLayout>,
      { user: ADMIN },
    );
    expect(
      document.querySelector('[data-slot="admin-phone-header"]'),
    ).not.toBeNull();

    viewport.setPhone(false);

    expect(
      document.querySelector('[data-slot="admin-phone-header"]'),
    ).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Admin sections" });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    expect(
      within(nav).getByRole("link", { name: "Dashboard" }),
    ).not.toHaveClass("ph-chip");
    expect(screen.getByText("dashboard body")).toBeInTheDocument();
  });
});
