import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeaturesPage } from "@/app/(protected)/admin/features/features-page";
import AdminLayout from "@/app/(protected)/admin/layout";
import { formatFeatureDate } from "@/components/admin/feature-copy";
import { AdminFeaturesScreenView } from "@/components/phone/screens/admin-features-screen";
import type { AdminFeature } from "@/services/types/features";
import type { User } from "@/services/types/users";
import { pathname } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: ADMIN, isLoading: false, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    admin: { getFeatures: mocks.list },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

const JOBS: AdminFeature = {
  key: "jobs",
  name: "Job board",
  description: "Remote job list, CV fit and keyword tailoring (PRD 0012)",
  stage: "beta",
  beta_user_count: 12,
  released_at: null,
  updated_at: "2026-10-14T12:00:00Z",
  me: { has: true, via: "admin", opted_out: false },
};

const CVS: AdminFeature = {
  key: "cvs",
  name: "CV builder",
  description: "  ",
  stage: "general",
  beta_user_count: 1234,
  released_at: "2026-10-20T12:00:00Z",
  updated_at: "2026-10-20T12:00:00Z",
  me: { has: true, via: "general", opted_out: true },
};

const OLD: AdminFeature = {
  key: "old_general",
  name: "Old general",
  description: null,
  stage: "general",
  beta_user_count: 0,
  released_at: null,
  updated_at: "2026-09-01T12:00:00Z",
  me: { has: true, via: "general", opted_out: false },
};

const OFF: AdminFeature = {
  key: "reports",
  name: "Reports",
  description: "Biweekly reports",
  stage: "beta",
  beta_user_count: 3,
  released_at: null,
  updated_at: "2026-10-01T12:00:00Z",
  me: { has: false, via: null, opted_out: true },
};

beforeEach(() => {
  pathname.current = "/admin/features";
  mocks.list.mockReset().mockResolvedValue([JOBS, CVS, OLD, OFF]);
});

const renderBoard = () =>
  renderPhoneScreen(
    "/admin/features",
    <AdminLayout>
      <FeaturesPage />
    </AdminLayout>,
    { user: ADMIN },
  );

const card = (key: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="feature-row"][data-feature-key="${key}"]`,
  )!;

const slot = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;

describe("the admin Features board below md", () => {
  it("heads itself Features with its lead, above the chips", async () => {
    await renderBoard();

    expect(
      screen.getByRole("heading", { level: 1, name: "Features" }),
    ).toHaveClass("ph-h1", "ph-h1-26");
    expect(
      screen.getByText(
        "A new feature starts in beta: only users on its beta list and admins have it. Release it to give it to everyone.",
      ),
    ).toHaveClass("ph-lead");
    const chips = screen.getByRole("navigation", { name: "Admin sections" });
    expect(
      within(chips).getByRole("link", { name: "Features" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Admin Console")).toBeNull();
  });

  it("says it is loading while the list comes", async () => {
    mocks.list.mockReset().mockReturnValue(new Promise(() => {}));
    await renderBoard();

    expect(
      screen.getByText("Loading features").closest('[role="status"]'),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("draws one card per feature: name, stage, description, key, beta users, released, and You", async () => {
    await renderBoard();
    await screen.findByText("Job board");

    const list = document.querySelector('[data-slot="features"]')!;
    expect(list.tagName).toBe("UL");
    expect(list).toHaveClass("ph-af-list");
    expect(
      Array.from(list.querySelectorAll('li[data-slot="feature-row"]'), (row) =>
        row.getAttribute("data-feature-key"),
      ),
    ).toEqual(["jobs", "cvs", "old_general", "reports"]);

    const jobs = card("jobs");
    expect(jobs).toHaveAttribute("data-stage", "beta");
    const link = within(jobs).getByRole("link", { name: "Job board" });
    expect(link).toHaveAttribute("href", "/admin/features/view?key=jobs");
    expect(link).toHaveClass("ph-card", "ph-af-card");
    expect(within(jobs).getByText("Job board")).toHaveClass("ph-af-name");
    expect(within(jobs).getByText("Beta").closest(".ph-pill")).toHaveClass(
      "ph-pri",
    );
    expect(slot(jobs, "feature-description")).toHaveTextContent(
      "Remote job list, CV fit and keyword tailoring (PRD 0012)",
    );
    expect(slot(jobs, "feature-description")).not.toHaveAttribute("data-empty");
    expect(jobs.querySelector(".ph-af-chev")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const facts = jobs.querySelector("dl")!;
    expect(facts).toHaveClass("ph-dl", "ph-dl-3s", "ph-af-dl");
    expect(
      Array.from(facts.querySelectorAll("dt"), (term) => term.textContent),
    ).toEqual(["Key", "Beta users", "Released"]);
    expect(slot(jobs, "feature-key")).toHaveTextContent("jobs");
    expect(slot(jobs, "feature-key")).toHaveClass("ph-mono");
    expect(slot(jobs, "feature-beta-count")).toHaveTextContent("12");
    expect(slot(jobs, "feature-released")).toHaveTextContent("Not released");
    const you = slot(jobs, "feature-you");
    expect(you).toHaveAttribute("data-has", "true");
    expect(you).toHaveAttribute("data-access", "admin");
    expect(you).toHaveTextContent("YouYes, as an admin");
    expect(you.querySelector(".ph-af-yes")).not.toBeNull();
    expect(you.querySelector(".ph-af-no")).toBeNull();

    const cvs = card("cvs");
    const general = within(cvs).getByText("General").closest(".ph-pill");
    expect(general).toHaveClass("ph-ok");
    expect(general?.querySelector(".ph-dot")).toHaveStyle({
      background: "var(--success)",
    });
    expect(slot(cvs, "feature-description")).toHaveTextContent(
      "No description",
    );
    expect(slot(cvs, "feature-description")).toHaveAttribute("data-empty");
    expect(slot(cvs, "feature-beta-count")).toHaveTextContent("1,234");
    const released = slot(cvs, "feature-released");
    expect(released.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-20T12:00:00Z",
    );
    expect(released).toHaveTextContent(
      formatFeatureDate("2026-10-20T12:00:00Z"),
    );
    // Released wins over the stored opt-out, as today's "You" column.
    expect(slot(cvs, "feature-you")).toHaveTextContent(
      "Yes, released to everyone",
    );

    // General with no recorded date: a dash read "Not recorded".
    const old = slot(card("old_general"), "feature-released");
    expect(old.querySelector('[aria-hidden="true"]')).toHaveTextContent("—");
    expect(within(old).getByText("Not recorded")).toHaveClass("ph-sr");

    const off = slot(card("reports"), "feature-you");
    expect(off).toHaveAttribute("data-has", "false");
    expect(off).toHaveAttribute("data-access", "off");
    expect(off).toHaveTextContent("No, you turned it off");
    expect(off.querySelector(".ph-af-no")).not.toBeNull();
    expect(off.querySelector(".ph-af-yes")).toBeNull();
  });

  it("says there is no feature yet on an empty list", async () => {
    mocks.list.mockReset().mockResolvedValue([]);
    await renderBoard();

    const empty = await waitFor(() => {
      const found = document.querySelector('[data-slot="features-empty"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(empty).toHaveClass("ph-card", "ph-state-card");
    expect(within(empty).getByText("No features yet")).toHaveClass(
      "ph-state-t",
    );
    expect(
      within(empty).getByText(
        "Features appear here once the database upgrade that adds them has run.",
      ),
    ).toHaveClass("ph-hint", "ph-state-b");
  });

  it("shows a failed load with Try again, which loads the list and hands focus back", async () => {
    let answer: (rows: AdminFeature[]) => void = () => {};
    mocks.list
      .mockReset()
      .mockRejectedValueOnce({ response: { status: 500, data: {} } })
      .mockReturnValueOnce(
        new Promise<AdminFeature[]>((resolve) => {
          answer = resolve;
        }),
      );
    const user = userEvent.setup();
    await renderBoard();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-slot", "features-error");
    expect(alert).toHaveClass("ph-card", "ph-alert-card");
    expect(within(alert).getByText("Could not load features")).toHaveClass(
      "ph-state-t",
    );
    expect(
      within(alert).getByText(
        "The list did not load. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    const retry = within(alert).getByRole("button", { name: "Try again" });
    expect(retry).toHaveClass("ph-btn", "ph-sec", "ph-sm");
    expect(retry).not.toHaveAttribute("aria-busy");

    await user.click(retry);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Loading features")).toBeInTheDocument();

    answer([JOBS]);
    expect(await screen.findByText("Job board")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    // The pressed button left with the failure: the region takes focus.
    expect(
      document.querySelector(
        '[data-slot="phone-admin-features"] [data-slot="phone-loadable"]',
      ),
    ).toHaveFocus();
  });

  it("keeps Try again focusable and busy while a retry runs, and ignores a second press", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <AdminFeaturesScreenView
        features={{
          status: "error",
          message: "Server down",
          onRetry,
          retrying: true,
        }}
      />,
    );

    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(retry).not.toBeDisabled();
    expect(retry.querySelector(".ph-spin")).not.toBeNull();
    // The board's fixed words, never the API's.
    expect(screen.queryByText("Server down")).toBeNull();
    await user.click(retry);
    expect(retry).toHaveFocus();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("dims the cards while the page refetches the list", async () => {
    const { client } = await renderBoard();
    await screen.findByText("Job board");
    const list = document.querySelector('[data-slot="features"]')!;
    expect(list).not.toHaveAttribute("data-refreshing");

    mocks.list.mockReturnValue(new Promise(() => {}));
    void client.refetchQueries({ queryKey: ["admin", "features"] });
    await waitFor(() =>
      expect(document.querySelector('[data-slot="features"]')).toHaveAttribute(
        "data-refreshing",
      ),
    );
    expect(document.querySelector('[data-slot="features"]')).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("dims the cards while the list refreshes", () => {
    render(
      <AdminFeaturesScreenView
        features={{ status: "ready", data: [JOBS] }}
        refreshing
      />,
    );
    const list = document.querySelector('[data-slot="features"]')!;
    expect(list).toHaveAttribute("data-refreshing");
    expect(list).toHaveAttribute("aria-busy", "true");
  });

  it("ends a long feature name in an ellipsis, the stage pill keeps its size", async () => {
    const long =
      "A feature name far too long to sit on one phone row beside its stage pill";
    mocks.list.mockReset().mockResolvedValue([{ ...JOBS, name: long }]);
    await renderBoard();

    const name = await screen.findByText(long);
    expect(name).toHaveClass("ph-af-name");
    expect(name.parentElement).toHaveClass("ph-af-title");
    expect(within(card("jobs")).getByRole("link")).toHaveAccessibleName(long);
  });

  it("renders today's table at md and up", async () => {
    const { viewport } = renderPhonePage(<FeaturesPage />, { user: ADMIN });
    await screen.findByText("Job board");
    expect(
      document.querySelector('[data-slot="phone-admin-features"]'),
    ).not.toBeNull();

    viewport.setPhone(false);

    expect(
      document.querySelector('[data-slot="phone-admin-features"]'),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Features" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
