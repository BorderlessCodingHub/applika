import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "@/app/(protected)/profile/profile-page";
import type { GeneralStats } from "@/services/types/statistics";
import type { User } from "@/services/types/users";
import { setLocation } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  general: vi.fn(),
  sessions: vi.fn(),
  deleteMe: vi.fn(),
  startRestore: vi.fn(),
  user: { current: null as User | null },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mocks.user.current, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/profile";
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    statistics: { getGeneralStats: mocks.general },
    sessions: { list: mocks.sessions },
    users: { deleteMe: mocks.deleteMe },
    auth: { startGithubRestore: mocks.startRestore },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

/** Sam with every profile field, a held BASE badge and the restore open. */
const FULL: User = {
  ...SAM,
  current_role: "Frontend Engineer",
  current_company: "Acme",
  bio: "Building calm interfaces.",
  seniority_level: "senior",
  experience_years: 6,
  location: "Lisbon, Portugal",
  current_salary: 58000,
  salary_currency: "EUR",
  salary_period: "annually",
  linkedin_url: "https://www.linkedin.com/in/samcarter/",
  tech_stack: ["React", "TypeScript"],
  availability: "open_to_work",
  badges: [{ badge: "borderless_base", granted_at: "2026-10-01" }],
  borderless: { status: "active", email: "sam@example.com", checked_at: null },
  github_restore: { available: true, prompt: false },
};

const STATS: GeneralStats = {
  total_applications: 12,
  success_rate: 8,
  offers: 1,
  denials: 2,
  active: 9,
};

beforeEach(() => {
  setLocation("/profile");
  mocks.user.current = FULL;
  mocks.general.mockReset().mockResolvedValue(STATS);
  mocks.sessions.mockReset().mockResolvedValue([]);
  mocks.deleteMe.mockReset().mockReturnValue(new Promise(() => {}));
  mocks.startRestore.mockReset().mockReturnValue(new Promise(() => {}));
});

const renderProfile = () =>
  renderPhoneScreen("/profile", <ProfilePage />, { user: mocks.user.current! });

describe("Profile below md", () => {
  it("renders the Profile board with today's data", async () => {
    await renderProfile();

    const screenRoot = document.querySelector('[data-slot="phone-profile"]')!;
    expect(screenRoot).toHaveClass("ph-app", "ph-pf");
    expect(
      screen.getByRole("heading", { level: 1, name: "Sam Carter" }),
    ).toBeInTheDocument();
    expect(screenRoot).toHaveTextContent("SC");
    expect(screen.getByText("Frontend Engineer at Acme")).toBeInTheDocument();
    expect(screen.getByText("Borderless BASE member")).toBeInTheDocument();
    expect(screen.getByText("Building calm interfaces.")).toHaveClass(
      "ph-pf-bio",
    );

    const details = screen.getByRole("region", { name: "Details" });
    const terms = within(details)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(terms).toEqual([
      "Seniority",
      "Experience",
      "Location",
      "Salary",
      "LinkedIn",
    ]);
    expect(within(details).getByText(/€58,000 \/ annually/)).toBeVisible();
    const linkedin = within(details).getByRole("link", {
      name: /linkedin\.com\/in\/samcarter/,
    });
    expect(linkedin).toHaveAttribute("target", "_blank");
    expect(linkedin).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/samcarter/",
    );

    const stack = screen.getByRole("region", { name: "Tech Stack" });
    expect(
      within(stack)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["React", "TypeScript"]);

    // Badges: 12 applications and one offer earn three of six.
    await waitFor(() =>
      expect(screen.getByText("3/6 earned")).toBeInTheDocument(),
    );
    const earned = Array.from(
      document.querySelectorAll('[data-slot="profile-badges"] li'),
    ).map((li) => [
      li.getAttribute("data-badge"),
      li.getAttribute("data-earned"),
    ]);
    expect(earned).toEqual([
      ["first_app", "true"],
      ["ten_apps", "true"],
      ["fifty_apps", "false"],
      ["hundred_apps", "false"],
      ["first_offer", "true"],
      ["high_rate", "false"],
    ]);
    expect(document.querySelector('[data-badge="fifty_apps"]')).toHaveClass(
      "ph-off",
    );

    // Edit sits at the right of the back bar.
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("button", { name: "Edit" })).toHaveAttribute(
      "data-action",
      "edit-profile",
    );
    expect(within(bar).getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("drops the cells and sections the user has not filled", async () => {
    mocks.user.current = { ...SAM };
    await renderProfile();

    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Tech Stack" })).toBeNull();
    expect(
      document.querySelector('[data-slot="github-restore-card"]'),
    ).toBeNull();
    expect(screen.queryByText(/member$/)).toBeNull();
  });

  it("shows the badges loading, then their failure with Retry", async () => {
    let fail: (error: unknown) => void = () => {};
    mocks.general.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const user = userEvent.setup();
    await renderProfile();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading badges");
    expect(screen.queryByText(/earned$/)).toBeNull();

    fail({ response: { status: 500, data: { detail: "Stats are down" } } });
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByText("3/6 earned")).toBeInTheDocument(),
    );
    expect(mocks.general).toHaveBeenCalledTimes(2);
  });

  it("switches to Devices in place, and back, through ?tab=", async () => {
    const user = userEvent.setup();
    await renderProfile();

    const nav = screen.getByRole("navigation", { name: "Profile sections" });
    const profileLink = within(nav).getByRole("link", { name: "Profile" });
    const devicesLink = within(nav).getByRole("link", { name: "Devices" });
    expect(profileLink).toHaveAttribute("aria-current", "page");
    expect(profileLink).toHaveAttribute("href", "/profile");
    expect(devicesLink).toHaveAttribute("href", "/profile?tab=devices");
    expect(devicesLink).not.toHaveAttribute("aria-current");

    await user.click(devicesLink);

    expect(window.location.search).toBe("?tab=devices");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Active" }),
    ).toBeInTheDocument();
    const devicesNav = screen.getByRole("navigation", {
      name: "Profile sections",
    });
    const current = within(devicesNav).getByRole("link", { name: "Devices" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveFocus();
    expect(mocks.sessions).toHaveBeenCalledOnce();

    // Back goes to the Profile section.
    window.history.back();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Sam Carter" }),
      ).toBeInTheDocument(),
    );
  });

  it("after a switch, Edit still focuses the form and Cancel the Edit button", async () => {
    const user = userEvent.setup();
    await renderProfile();

    await user.click(screen.getByRole("link", { name: "Devices" }));
    await screen.findByRole("heading", { level: 1, name: "Active" });
    await user.click(screen.getByRole("link", { name: "Profile" }));
    await screen.findByRole("heading", { level: 1, name: "Sam Carter" });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editing = document.querySelector<HTMLElement>(
      '[data-slot="phone-profile"][data-editing]',
    )!;
    await waitFor(() => expect(editing).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus(),
    );
  });

  it("shows the board's shapes while the user loads", async () => {
    mocks.user.current = null;
    await renderPhoneScreen("/profile", <ProfilePage />);

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading your profile");
  });

  it("opens Devices from ?tab=devices (the Account hub's row)", async () => {
    setLocation("/profile?tab=devices");
    await renderProfile();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Active" }),
    ).toBeInTheDocument();
    expect(mocks.general).not.toHaveBeenCalled();
  });

  it("starts the GitHub restore while it is available, pending until the browser leaves", async () => {
    const user = userEvent.setup();
    await renderProfile();

    const card = screen.getByRole("region", { name: "Old GitHub account" });
    const restore = within(card).getByRole("button", {
      name: "Restore data from GitHub",
    });
    await user.click(restore);

    expect(mocks.startRestore).toHaveBeenCalledOnce();
    expect(restore).toHaveAttribute("aria-busy", "true");
    expect(restore).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the GitHub round trip's notice and clears the address", async () => {
    setLocation("/profile?account=github&status=not_found");
    await renderProfile();

    expect(
      screen.getByText(
        "No old applika account was found for this GitHub account. Nothing was changed.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("Edit opens today's form in place of the profile; Cancel brings the board back", async () => {
    const user = userEvent.setup();
    await renderProfile();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      document.querySelector('[data-slot="phone-profile"][data-editing]'),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Profile sections" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("deletes the account only once the phrase is typed; Cancel puts focus back", async () => {
    const user = userEvent.setup();
    await renderProfile();

    const section = screen.getByRole("region", { name: "Delete account" });
    expect(section).toHaveClass("ph-pf-delete");
    const open = within(section).getByRole("button", {
      name: "Delete your account",
    });
    await user.click(open);

    const field = within(section).getByRole("textbox", {
      name: "To confirm, type delete scarter below:",
    });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("autocapitalize", "none");
    const destroy = within(section).getByRole("button", {
      name: "I understand, delete my account",
    });
    expect(destroy).toHaveAttribute("aria-disabled", "true");
    await user.click(destroy);
    expect(mocks.deleteMe).not.toHaveBeenCalled();

    await user.click(within(section).getByRole("button", { name: "Cancel" }));
    expect(
      within(section).getByRole("button", { name: "Delete your account" }),
    ).toHaveFocus();

    await user.click(
      within(section).getByRole("button", { name: "Delete your account" }),
    );
    await user.type(within(section).getByRole("textbox"), "delete scarter");
    const armed = within(section).getByRole("button", {
      name: "I understand, delete my account",
    });
    expect(armed).not.toHaveAttribute("aria-disabled");
    await user.click(armed);
    expect(mocks.deleteMe).toHaveBeenCalledOnce();
    expect(
      await within(section).findByRole("button", { name: "Deleting..." }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("renders today's tabs at md and up, and swaps when the width crosses md", async () => {
    const { viewport } = renderPhonePage(<ProfilePage />, { user: FULL });
    expect(
      screen.getByRole("navigation", { name: "Profile sections" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();

    viewport.setPhone(false);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.querySelector('[data-slot="phone-profile"]')).toBeNull();

    viewport.setPhone(true);
    expect(
      document.querySelector('[data-slot="phone-profile"]'),
    ).toBeInTheDocument();
  });

  it("lands on the same section when the width crosses md", async () => {
    setLocation("/profile?tab=devices");
    const { viewport } = renderPhonePage(<ProfilePage />, { user: FULL });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Active" }),
    ).toBeInTheDocument();

    viewport.setPhone(false);

    expect(screen.getByRole("tab", { name: "Devices" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
