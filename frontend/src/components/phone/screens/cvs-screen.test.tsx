import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CvsPage } from "@/app/(protected)/cvs/cvs-page";
import type { BaseCv } from "@/services/types/base-cv";
import type { MyFeature } from "@/services/types/features";
import { pathname, setLocation } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

/** `/cvs` below md: v2/CVs on today's hooks, inside today's `cvs` gate. */

const mocks = vi.hoisted(() => ({
  features: { current: [] as MyFeature[] },
  list: vi.fn(),
  remove: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.toastError, info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: () => Promise.resolve(mocks.features.current) },
    baseCvs: {
      list: (...args: unknown[]) => mocks.list(...args),
      remove: (...args: unknown[]) => mocks.remove(...args),
      exportPdf: vi.fn(),
      exportMarkdown: vi.fn(),
    },
  },
}));

const CVS: MyFeature[] = [{ key: "cvs", stage: "beta" }];

function makeCv(overrides: Partial<BaseCv> = {}): BaseCv {
  return {
    id: "7",
    name: "Backend CV",
    full_name: "Sam Carter",
    headline: "Senior Backend Engineer",
    location: "Lisbon",
    email: "sam@example.com",
    phone: null,
    summary: "",
    links: [],
    skills: [
      { id: "s1", category: "Languages", keywords: ["Python", "Go"] },
      { id: "s2", category: "Data", keywords: ["Postgres"] },
    ],
    experience: [
      {
        id: "e1",
        company: "Acme",
        role: "Engineer",
        start: "2021-03",
        bullets: [],
      },
    ],
    projects: [],
    education: [],
    certifications: [],
    languages: [{ id: "g1", name: "English", level: "Native" }],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-30T10:00:00Z",
    ...overrides,
  } as BaseCv;
}

const BACKEND = makeCv();
const FRONTEND = makeCv({
  id: "8",
  name: "Frontend CV",
  headline: "",
  skills: [],
  experience: [],
  languages: [],
});

beforeEach(() => {
  mocks.features.current = CVS;
  mocks.list.mockReset().mockResolvedValue([BACKEND, FRONTEND]);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.toastError.mockReset();
  pathname.current = "/cvs";
  setLocation("/cvs");
});

const renderCvs = (features: MyFeature[] = CVS) => {
  mocks.features.current = features;
  return renderPhoneScreen("/cvs", <CvsPage />, { features });
};

const cardOf = (id: string) =>
  document.querySelector(
    `li[data-slot="cv-card"][data-cv-id="${id}"]`,
  ) as HTMLElement;

describe("CVs below md", () => {
  it("renders the CVs board: each master CV's card and the new-CV tile with the slots left", async () => {
    await renderCvs();

    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(within(bar).getByText("Beta")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "CVs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your master CVs. Keep up to three and reuse them for every application.",
      ),
    ).toHaveClass("ph-lead");

    await screen.findByRole("heading", { level: 2, name: "Backend CV" });
    const card = cardOf("7");
    expect(card).toHaveClass("ph-card", "ph-cv-card");
    expect(card.querySelector(".ph-cv-thumb")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(within(card).getByText("Senior Backend Engineer")).toHaveClass(
      "ph-cv-headline",
    );
    expect(within(card).getByText("Updated Oct 30, 2026")).toBeInTheDocument();
    expect(
      within(card)
        .getAllByText(/^(Python|Go|Postgres)$/)
        .map((tag) => tag.textContent),
    ).toEqual(["Python", "Go", "Postgres"]);
    expect(
      within(card).getByText("1 role · 0 projects · 1 language · 3 keywords"),
    ).toHaveClass("ph-mono", "ph-cv-counts");
    expect(
      within(card).getByRole("link", { name: "Edit Backend CV" }),
    ).toHaveAttribute("href", "/cvs/editor?id=7");
    const remove = within(card).getByRole("button", {
      name: "Delete Backend CV",
    });
    expect(remove).toHaveClass("ph-btn", "ph-sm", "ph-dan");
    expect(remove).toHaveAttribute("aria-haspopup", "dialog");

    expect(
      within(cardOf("8")).getByText("No skills added yet"),
    ).toBeInTheDocument();

    const tile = screen.getByRole("link", { name: /New master CV/ });
    expect(tile).toHaveAttribute("href", "/cvs/new");
    expect(tile).toHaveClass("ph-cv-new");
    expect(within(tile).getByText("1 of 3 slot left")).toBeInTheDocument();
  });

  it("hides the tile at three and says why", async () => {
    mocks.list.mockResolvedValue([
      BACKEND,
      FRONTEND,
      makeCv({ id: "9", name: "Data CV" }),
    ]);
    await renderCvs();

    expect(
      await screen.findByText(
        "You already have 3 master CVs — the limit is three. Delete one to create another.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /New master CV/ })).toBeNull();
  });

  it("loads, fails with a Retry that refetches, and shows the empty state with the tile", async () => {
    const user = userEvent.setup();
    mocks.list.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { detail: "CVs are down" } },
    });
    const { unmount } = await renderCvs();
    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading your master CVs");
    expect(await screen.findByText("CVs are down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Backend CV" }),
    ).toBeInTheDocument();
    unmount();

    mocks.list.mockResolvedValue([]);
    await renderCvs();
    expect(await screen.findByText("No master CVs yet")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 slots left")).toBeInTheDocument();
  });

  it("confirms Delete in a sheet that stays open while it runs, then closes and focuses the h1", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    mocks.remove.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await renderCvs();
    await screen.findByRole("heading", { level: 2, name: "Backend CV" });

    await user.click(screen.getByRole("button", { name: "Delete Backend CV" }));
    const sheet = screen.getByRole("alertdialog", {
      name: "Delete this master CV?",
    });
    expect(sheet).toHaveAccessibleDescription(
      '"Backend CV" and everything in it is removed for good. This cannot be undone.',
    );
    const buttons = within(sheet).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Cancel",
      "Delete",
    ]);
    expect(buttons[0]).toHaveFocus();

    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    expect(mocks.remove).toHaveBeenCalledWith("7");
    expect(
      within(sheet).getByRole("button", { name: "Deleting..." }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(cardOf("7")).toHaveAttribute("data-deleting");

    mocks.list.mockResolvedValue([FRONTEND]);
    finish();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(cardOf("7")).toBeNull());
    expect(
      screen.getByRole("heading", { level: 1, name: "CVs" }),
    ).toHaveFocus();
  });

  it("keeps the sheet when the delete fails (today's toast), and Cancel closes it", async () => {
    const user = userEvent.setup();
    mocks.remove.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { detail: "Could not delete" } },
    });
    await renderCvs();
    await screen.findByRole("heading", { level: 2, name: "Backend CV" });

    await user.click(screen.getByRole("button", { name: "Delete Backend CV" }));
    const sheet = screen.getByRole("alertdialog");
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Could not delete"),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      screen.getByRole("button", { name: "Delete Backend CV" }),
    ).toHaveFocus();
  });

  it("without cvs: page not found and not one CV request", async () => {
    await renderCvs([{ key: "jobs", stage: "beta" }]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("swaps to today's gallery at md", async () => {
    mocks.features.current = CVS;
    const { viewport } = renderPhonePage(<CvsPage />, { features: CVS });
    await screen.findByRole("heading", { level: 2, name: "Backend CV" });
    expect(document.querySelector('[data-slot="phone-cvs"]')).not.toBeNull();

    viewport.setPhone(false);
    expect(document.querySelector('[data-slot="phone-cvs"]')).toBeNull();
    expect(
      await screen.findAllByRole("button", { name: /Download PDF/ }),
    ).not.toHaveLength(0);
  });
});
