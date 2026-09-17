import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CvsPage } from "./cvs-page";
import { BASE_CV_LIMIT_REASON } from "@/components/base-cvs/new-cv-card";
import type { BaseCv } from "@/services/types/base-cv";

/**
 * `/cvs` list, delete and the visible cap (KODI-002 / R-001, R-002, R-003).
 *
 * AC3 — the page lists the user's own master CVs and deletes one on demand.
 * AC2 — at three CVs the create affordance is really disabled and the words
 * "the limit is three" are on screen, in the page, not only in the component.
 */

const listMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    baseCvs: {
      list: (...args: unknown[]) => listMock(...args),
      remove: (...args: unknown[]) => removeMock(...args),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function cv(id: string, name: string): BaseCv {
  return {
    id,
    name,
    full_name: "Ada Lovelace",
    headline: "Engineer",
    location: "London",
    email: "ada@example.com",
    phone: null,
    summary: "Summary.",
    links: [],
    skills: [],
    experience: [],
    projects: [],
    certifications: [],
    languages: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CvsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  removeMock.mockResolvedValue(undefined);
});

describe("CvsPage", () => {
  it("lists the user's master CVs", async () => {
    listMock.mockResolvedValue([cv("1", "Backend CV"), cv("2", "Data CV")]);
    renderPage();

    expect(
      await screen.findByRole("link", { name: "Edit Backend CV" }),
    ).toHaveAttribute("href", "/cvs/editor?id=1");
    expect(screen.getByRole("link", { name: "Edit Data CV" })).toHaveAttribute(
      "href",
      "/cvs/editor?id=2",
    );
    expect(
      screen.getByRole("heading", { name: "CVs", level: 1 }),
    ).toBeInTheDocument();
  });

  it("claims no update date for a CV that has never been updated", async () => {
    // The API's `updated_at` is null until the first save. `new Date(null)` is
    // the epoch, so a naive render would announce 1970.
    listMock.mockResolvedValue([
      { ...cv("1", "Backend CV"), updated_at: null },
    ]);
    renderPage();

    await screen.findByRole("link", { name: "Edit Backend CV" });
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
  });

  it("deletes a CV once the user confirms", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([cv("1", "Backend CV")]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Delete Backend CV" }),
    );

    const dialog = within(await screen.findByRole("alertdialog"));
    expect(
      dialog.getByText("Delete this master CV?", { exact: false }),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith("1"));
  });

  it("does not delete anything when the user cancels", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([cv("1", "Backend CV")]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Delete Backend CV" }),
    );
    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("refuses the fourth CV on screen, saying the limit is three", async () => {
    listMock.mockResolvedValue([
      cv("1", "Backend CV"),
      cv("2", "Data CV"),
      cv("3", "Lead CV"),
    ]);
    renderPage();

    const create = await screen.findByRole("button", {
      name: "New master CV",
    });
    expect(create).toBeDisabled();
    expect(screen.getByText(BASE_CV_LIMIT_REASON)).toBeVisible();
    expect(BASE_CV_LIMIT_REASON).toContain("the limit is three");
    // There is no way around the disabled control: no create link is rendered.
    expect(
      screen.queryByRole("link", { name: "New master CV" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the create affordance live while a slot is free", async () => {
    listMock.mockResolvedValue([cv("1", "Backend CV"), cv("2", "Data CV")]);
    renderPage();

    expect(
      await screen.findByRole("link", { name: "New master CV" }),
    ).toHaveAttribute("href", "/cvs/new");
    expect(screen.getByText("1 of 3 slot left")).toBeInTheDocument();
  });

  it("invites the first CV when the user has none", async () => {
    listMock.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "No master CVs yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create your first CV" }),
    ).toHaveAttribute("href", "/cvs/new");
  });

  it("surfaces the API message when the list cannot be loaded", async () => {
    listMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { detail: "Backend is down" } },
    });
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Backend is down")).toBeInTheDocument();
    expect(
      within(alert).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
