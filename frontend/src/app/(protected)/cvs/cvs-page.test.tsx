import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CvsPage } from "./cvs-page";
import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import type { MyFeature } from "@/services/types/features";
import { NEW_CV_COPY } from "@/components/base-cvs/new-cv-card";
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
const exportPdfMock = vi.fn();
const exportMarkdownMock = vi.fn();

/** The caller's features: `cvs` in beta unless a test says otherwise. */
let myFeatures: MyFeature[] = [{ key: "cvs", stage: "beta" }];
const getMyFeatures = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: (...args: unknown[]) => getMyFeatures(...args) },
    baseCvs: {
      list: (...args: unknown[]) => listMock(...args),
      remove: (...args: unknown[]) => removeMock(...args),
      exportPdf: (...args: unknown[]) => exportPdfMock(...args),
      exportMarkdown: (...args: unknown[]) => exportMarkdownMock(...args),
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
    education: [],
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
  client.setQueryData(MY_FEATURES_QUERY_KEY, myFeatures);
  return render(
    <QueryClientProvider client={client}>
      <CvsPage />
    </QueryClientProvider>,
  );
}

/** What the browser was handed, so the download is asserted, not assumed. */
let saved: { download: string; href: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  myFeatures = [{ key: "cvs", stage: "beta" }];
  getMyFeatures.mockImplementation(async () => myFeatures);
  saved = [];
  removeMock.mockResolvedValue(undefined);
  exportPdfMock.mockResolvedValue({
    blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    filename: "data-cv.pdf",
  });
  exportMarkdownMock.mockResolvedValue({
    blob: new Blob(["# Data CV"], { type: "text/markdown" }),
    filename: "data-cv.md",
  });
  // jsdom has no object URLs; assign onto the real `URL` rather than replacing
  // it, so `new URL(...)` keeps working elsewhere.
  URL.createObjectURL = (() =>
    "blob:applika/pdf") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
  vi.restoreAllMocks();
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
    expect(screen.getByText(NEW_CV_COPY.limitReason)).toBeVisible();
    expect(NEW_CV_COPY.limitReason).toContain("the limit is three");
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

/**
 * The gallery's download (KODI-009 / AC2).
 *
 * The owner: "add a button to download the CV". It is the SAME export route
 * the editor already uses (ADR 0011, the PDF is typeset on the server); there
 * is no second path and nothing is rendered in the browser.
 */
describe("CvsPage downloads a CV as Markdown (KODI-017 part 3)", () => {
  it("asks the Markdown route for the pressed CV, distinct from the PDF one", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([cv("1", "Backend CV"), cv("2", "Data CV")]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Download Markdown Data CV" }),
    );

    await waitFor(() => expect(exportMarkdownMock).toHaveBeenCalledTimes(1));
    expect(exportMarkdownMock).toHaveBeenCalledWith("2");
    expect(exportPdfMock).not.toHaveBeenCalled();
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].download).toBe("data-cv.md");
  });
});

describe("CvsPage downloads a CV as a PDF", () => {
  it("asks the existing export route for the CV that was pressed", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([cv("1", "Backend CV"), cv("2", "Data CV")]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Download PDF Data CV" }),
    );

    // One request, on the pressed CV's id, through the one service method.
    await waitFor(() => expect(exportPdfMock).toHaveBeenCalledTimes(1));
    expect(exportPdfMock).toHaveBeenCalledWith("2");
    // And the bytes really reached the browser's download manager, under the
    // name the SERVER chose.
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      download: "data-cv.pdf",
      href: "blob:applika/pdf",
    });
  });

  it("falls back to the CV's own slug when the server sent no filename", async () => {
    const user = userEvent.setup();
    exportPdfMock.mockResolvedValue({
      blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      filename: null,
    });
    listMock.mockResolvedValue([cv("1", "CV — 2026 (final)")]);
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Download PDF CV — 2026 (final)",
      }),
    );

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].download).toBe("cv-2026-final.pdf");
  });

  it("marks only the pressed tile busy while the server renders", async () => {
    const user = userEvent.setup();
    let release: (value: { blob: Blob; filename: string }) => void = () => {};
    exportPdfMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    listMock.mockResolvedValue([cv("1", "Backend CV"), cv("2", "Data CV")]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Download PDF Data CV" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Download PDF Data CV" }),
      ).toBeDisabled(),
    );
    // The other CV's download is untouched: the busy state is per tile.
    expect(
      screen.getByRole("button", { name: "Download PDF Backend CV" }),
    ).toBeEnabled();

    release({
      blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      filename: "data-cv.pdf",
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Download PDF Data CV" }),
      ).toBeEnabled(),
    );
  });

  it("puts the server's own words on screen when the render fails", async () => {
    const user = userEvent.setup();
    exportPdfMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 500,
        data: new Blob(
          [JSON.stringify({ detail: "Could not render the PDF" })],
          {
            type: "application/json",
          },
        ),
      },
    });
    listMock.mockResolvedValue([cv("1", "Backend CV")]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Download PDF Backend CV" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not render the PDF"),
    );
    expect(saved).toHaveLength(0);
    // The tile is usable again: a failed render never locks the download.
    expect(
      screen.getByRole("button", { name: "Download PDF Backend CV" }),
    ).toBeEnabled();
  });
});

describe("CvsPage behind the cvs feature (PRD 0015)", () => {
  it("shows the app's page not found and asks for no CV without cvs", async () => {
    myFeatures = [{ key: "jobs", stage: "beta" }];
    renderPage();

    expect(await screen.findByText("Oops! Page not found")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "CVs" }),
    ).not.toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("puts the Beta badge beside the h1, never inside it, while cvs is in beta", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "CVs",
    });
    const badge = screen.getByText("Beta");
    expect(badge).toHaveAttribute("data-slot", "beta-badge");
    expect(heading).not.toContainElement(badge);
    expect(heading.parentElement).toContainElement(badge);
  });

  it("shows no Beta badge once cvs is released", async () => {
    myFeatures = [{ key: "cvs", stage: "general" }];
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "CVs" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });
});
