import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompaniesPage } from "./companies-page";
import { services } from "@/services/services";

/**
 * PRD 0010 (KODI-033, T087): visibility filter, Added by (nested `created_by`)
 * and Approve on private rows only, with the 409 `detail` shown verbatim.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getCompanies: vi.fn(),
      publishCompany: vi.fn(),
    },
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CompaniesPage />
    </QueryClientProvider>,
  );
}

const PUBLIC_ROW = {
  id: "c-1",
  name: "Acme Inc",
  url: "https://acme.example",
  is_active: true,
  is_public: true,
  applications_count: 3,
  created_by: { id: "u-1", username: "alice" },
  created_at: "2026-01-01T00:00:00Z",
};

const PRIVATE_ROW = {
  id: "c-2",
  name: "Small Co",
  url: "",
  is_active: true,
  is_public: false,
  applications_count: 0,
  created_by: { id: "u-2", username: "bob" },
  created_at: "2026-01-02T00:00:00Z",
};

function paginated(items: (typeof PUBLIC_ROW)[]) {
  return { items, total: items.length, page: 1, per_page: 15, total_pages: 1 };
}

describe("CompaniesPage — visibility, Added by, Approve (PRD 0010)", () => {
  it("shows Added by and Approve only on the private row, url-less row renders without error", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(
      paginated([PUBLIC_ROW, PRIVATE_ROW]),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Acme Inc")).toBeInTheDocument(),
    );
    expect(screen.getByText("Small Co")).toBeInTheDocument();
    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
    expect(screen.getAllByText("bob").length).toBeGreaterThan(0);

    // Only the private row offers Approve.
    expect(
      screen.getByRole("button", { name: "Approve Small Co" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve Acme Inc" }),
    ).not.toBeInTheDocument();
  });

  it("sends the visibility param when the filter changes", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(paginated([]));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(services.admin.getCompanies).toHaveBeenCalled());

    await user.click(screen.getByRole("radio", { name: "Private" }));

    await waitFor(() =>
      expect(services.admin.getCompanies).toHaveBeenLastCalledWith(
        expect.objectContaining({ visibility: "private" }),
      ),
    );
  });

  it("shows the 409 detail verbatim and keeps the dialog open on a colliding publish", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(
      paginated([PRIVATE_ROW]),
    );
    vi.mocked(services.admin.publishCompany).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "A company named Small Co is already public: c-9" },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Small Co")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Approve Small Co" }));
    await user.click(
      await screen
        .findByRole("alertdialog")
        .then((dialog) =>
          within(dialog).getByRole("button", { name: "Approve" }),
        ),
    );

    expect(
      await screen.findByText(
        "A company named Small Co is already public: c-9",
      ),
    ).toBeInTheDocument();
  });

  it("publishes on confirm and closes the dialog (AC19 success path)", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(
      paginated([PRIVATE_ROW]),
    );
    vi.mocked(services.admin.publishCompany).mockResolvedValue({
      ...PRIVATE_ROW,
      is_public: true,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Small Co")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Approve Small Co" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(services.admin.publishCompany).toHaveBeenCalledWith("c-2"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
});
