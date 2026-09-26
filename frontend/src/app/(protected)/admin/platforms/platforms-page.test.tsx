import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlatformsPage } from "./platforms-page";
import { services } from "@/services/services";
import type { AdminPlatformRow } from "@/services/types/admin";

/**
 * PRD 0010 (KODI-035, T119): the admin "Supports" page is now "Platforms",
 * built on the same `CatalogTable` the companies page uses — paginated,
 * searchable, with visibility filter, Added by, Apps and Approve on private
 * rows, the 409 `detail` shown verbatim.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getPlatforms: vi.fn(),
      publishPlatform: vi.fn(),
      createPlatform: vi.fn(),
      updatePlatform: vi.fn(),
      deletePlatform: vi.fn(),
    },
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlatformsPage />
    </QueryClientProvider>,
  );
}

const PUBLIC_ROW: AdminPlatformRow = {
  id: "p-1",
  name: "LinkedIn",
  url: "https://linkedin.com",
  is_public: true,
  applications_count: 4,
  created_by: { id: "u-1", username: "alice" },
  created_at: "2026-01-01T00:00:00Z",
};

const PRIVATE_ROW: AdminPlatformRow = {
  id: "p-2",
  name: "Niche Board",
  url: null,
  is_public: false,
  applications_count: 0,
  created_by: { id: "u-2", username: "carol" },
  created_at: "2026-01-02T00:00:00Z",
};

function paginated(items: AdminPlatformRow[]) {
  return { items, total: items.length, page: 1, per_page: 15, total_pages: 1 };
}

describe("PlatformsPage", () => {
  it("shows the heading and the Add Platform action", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue(paginated([]));
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Platforms", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Platform" }),
    ).toBeInTheDocument();
  });

  it("shows the Apps column, Added by, and a url-null row with no error", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue(
      paginated([PUBLIC_ROW, PRIVATE_ROW]),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("LinkedIn")).toBeInTheDocument(),
    );
    expect(screen.getByText("Niche Board")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
    expect(screen.getAllByText("carol").length).toBeGreaterThan(0);
    expect(screen.getByText("No URL")).toBeInTheDocument();
  });

  it("offers Approve only on the private row", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue(
      paginated([PUBLIC_ROW, PRIVATE_ROW]),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Niche Board")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Approve Niche Board" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve LinkedIn" }),
    ).not.toBeInTheDocument();
  });

  it("sends the search and visibility params", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue(paginated([]));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(services.admin.getPlatforms).toHaveBeenCalled());

    await user.click(screen.getByRole("radio", { name: "Private" }));
    await waitFor(() =>
      expect(services.admin.getPlatforms).toHaveBeenLastCalledWith(
        expect.objectContaining({ visibility: "private" }),
      ),
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Search platforms" }),
      "Board",
    );
    await waitFor(() =>
      expect(services.admin.getPlatforms).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "Board" }),
      ),
    );
  });

  it("shows the 409 detail verbatim and keeps the dialog open on a colliding publish", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue(
      paginated([PRIVATE_ROW]),
    );
    vi.mocked(services.admin.publishPlatform).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "A platform named Niche Board is already public: 9" },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Niche Board")).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Approve Niche Board" }),
    );
    await user.click(
      await screen
        .findByRole("alertdialog")
        .then((dialog) =>
          within(dialog).getByRole("button", { name: "Approve" }),
        ),
    );

    expect(
      await screen.findByText(
        "A platform named Niche Board is already public: 9",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the delete dialog open and shows the server detail on a 409", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue(
      paginated([PRIVATE_ROW]),
    );
    vi.mocked(services.admin.deletePlatform).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "Niche Board is used by a draft." },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Niche Board")).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Delete Niche Board" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("Niche Board is used by a draft."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("paginates", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue({
      items: [PUBLIC_ROW],
      total: 30,
      page: 1,
      per_page: 15,
      total_pages: 2,
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(services.admin.getPlatforms).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });
});
