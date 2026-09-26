import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SupportsPage } from "./supports-page";
import { services } from "@/services/services";

/**
 * PRD 0008 / ADR 0012, R-021: admins can no longer create, edit or delete step
 * or feedback definitions. Pins T045/T046 — the admin supports page has no
 * step/feedback section, only Platforms.
 *
 * PRD 0010 (KODI-033, T087): a private platform (url-null included) shows
 * Added by and Approve; a public one shows neither.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getPlatforms: vi.fn(),
      publishPlatform: vi.fn(),
    },
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SupportsPage />
    </QueryClientProvider>,
  );
}

describe("SupportsPage", () => {
  it("shows only the Platforms section — no step or feedback definitions", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue([
      {
        id: "1",
        name: "LinkedIn",
        url: "https://linkedin.com",
        is_public: true,
      },
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("LinkedIn")).toBeInTheDocument(),
    );

    expect(screen.getByText("Add Platform")).toBeInTheDocument();
    expect(screen.queryByText("Step Definitions")).not.toBeInTheDocument();
    expect(screen.queryByText("Feedback Definitions")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Step")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Feedback")).not.toBeInTheDocument();
  });
});

describe("SupportsPage — private platforms (PRD 0010)", () => {
  it("offers Approve on a url-null private platform, not on a public one", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue([
      {
        id: "1",
        name: "LinkedIn",
        url: "https://linkedin.com",
        is_public: true,
      },
      {
        id: "2",
        name: "Niche Board",
        url: null,
        is_public: false,
        created_by: { id: "u-1", username: "carol" },
      },
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Niche Board")).toBeInTheDocument(),
    );
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve Niche Board" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve LinkedIn" }),
    ).not.toBeInTheDocument();
  });

  it("shows the 409 detail verbatim on a colliding publish", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue([
      { id: "2", name: "Niche Board", url: null, is_public: false },
    ]);
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

  it("publishes on confirm and closes the dialog (AC19 success path)", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue([
      { id: "2", name: "Niche Board", url: null, is_public: false },
    ]);
    vi.mocked(services.admin.publishPlatform).mockResolvedValue({
      id: "2",
      name: "Niche Board",
      url: null,
      is_public: true,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Niche Board")).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Approve Niche Board" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(services.admin.publishPlatform).toHaveBeenCalledWith("2"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
});
