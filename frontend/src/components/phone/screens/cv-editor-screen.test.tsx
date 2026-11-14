import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CvEditorPage } from "@/app/(protected)/cvs/editor/cv-editor-page";
import type { BaseCv } from "@/services/types/base-cv";
import type { MyFeature } from "@/services/types/features";
import { pathname, routerPush, setLocation } from "@/test/navigation";
import {
  SAM,
  renderPhoneScreen,
  renderShellAcrossMd,
} from "@/test/phone-screens";

/**
 * `/cvs/editor?id=` below md: v2/CVEditor on the page's own form, query,
 * save and PDF export. No live preview.
 */

const mocks = vi.hoisted(() => ({
  features: { current: [] as MyFeature[] },
  get: vi.fn(),
  update: vi.fn(),
  exportPdf: vi.fn(),
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
      get: (...args: unknown[]) => mocks.get(...args),
      update: (...args: unknown[]) => mocks.update(...args),
      exportPdf: (...args: unknown[]) => mocks.exportPdf(...args),
      exportMarkdown: vi.fn(),
      list: vi.fn(),
    },
  },
}));

const CVS: MyFeature[] = [{ key: "cvs", stage: "beta" }];

const SAVED_CV: BaseCv = {
  id: "7001",
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: null,
  summary: "Eight years on payment systems.",
  links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
  skills: [{ id: "s-1", category: "Languages", keywords: ["Python", "Go"] }],
  education: [],
  experience: [
    {
      id: "e-1",
      company: "Stripe",
      role: "Senior Backend Engineer",
      start: "2021-03",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [],
  certifications: [],
  languages: [{ id: "g-1", name: "English", level: "Native" }],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
} as BaseCv;

beforeEach(() => {
  mocks.features.current = CVS;
  mocks.get.mockReset().mockResolvedValue(SAVED_CV);
  mocks.update.mockReset().mockResolvedValue(SAVED_CV);
  mocks.exportPdf.mockReset().mockResolvedValue({
    blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    filename: "backend-cv.pdf",
  });
  mocks.toastError.mockReset();
  routerPush.mockReset();
  URL.createObjectURL = (() =>
    "blob:applika/pdf") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => {};
  pathname.current = "/cvs/editor";
  setLocation("/cvs/editor?id=7001");
});

const renderEditor = (features: MyFeature[] = CVS) => {
  mocks.features.current = features;
  return renderPhoneScreen("/cvs/editor", <CvEditorPage />, { features });
};

describe("the CV editor below md", () => {
  it("renders the CVEditor board: back to CVs, PDF, the sections as rows, no preview", async () => {
    await renderEditor();

    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "CVs" })).toHaveAttribute(
      "href",
      "/cvs",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Edit master CV" }),
    ).toBeInTheDocument();

    const pdf = await within(bar).findByRole("button", {
      name: "Download PDF",
    });
    expect(pdf).toHaveTextContent("PDF");
    expect(pdf).toHaveClass("ph-btn", "ph-sm", "ph-sec");

    const identity = screen.getByRole("button", {
      name: "Identity and contact",
    });
    expect(identity).toHaveAttribute("aria-expanded", "true");
    expect(identity).toHaveAccessibleDescription(
      "Ada Lovelace · Senior Backend Engineer",
    );
    expect(await screen.findByDisplayValue("Ada Lovelace")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Experience" }),
    ).toHaveAccessibleDescription("1 role");
    expect(
      screen.getByRole("button", { name: "Skills" }),
    ).toHaveAccessibleDescription("1 group · 2 keywords");

    // No live preview, no desktop footer: one bar.
    expect(document.querySelector('[data-slot="cv-document"]')).toBeNull();
    expect(document.querySelector('[data-slot="cv-page"]')).toBeNull();
    expect(screen.queryByText(/layout/i)).toBeNull();
    expect(document.querySelectorAll(".ph-bar")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/cvs",
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("type", "submit");
  });

  it("saves the form as today (ids round-trip) and returns to /cvs", async () => {
    const user = userEvent.setup();
    await renderEditor();
    const fullName = await screen.findByDisplayValue("Ada Lovelace");

    await user.clear(fullName);
    await user.type(fullName, "Ada King");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const [id, payload] = mocks.update.mock.calls[0];
    expect(id).toBe("7001");
    expect(payload).toMatchObject({
      full_name: "Ada King",
      links: [{ id: "l-1" }],
      experience: [{ id: "e-1" }],
    });
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/cvs"));
  });

  it("opens the failing section and keeps Save from sending an invalid CV", async () => {
    const user = userEvent.setup();
    await renderEditor();
    const fullName = await screen.findByDisplayValue("Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Links" }));
    expect(fullName).not.toBeInTheDocument();
    // Clearing a field hidden in a closed row is not possible; reopen Identity.
    await user.click(
      screen.getByRole("button", { name: "Identity and contact" }),
    );
    await user.clear(screen.getByDisplayValue("Ada Lovelace"));
    await user.click(screen.getByRole("button", { name: "Links" }));

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const identity = screen.getByRole("button", {
      name: "Identity and contact",
    });
    await waitFor(() =>
      expect(identity).toHaveAttribute("aria-expanded", "true"),
    );
    expect(identity).toHaveAccessibleDescription("Needs a fix");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("downloads the STORED CV as a PDF from the top bar, spinning while the server typesets", async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    let finish: (value: unknown) => void = () => {};
    mocks.exportPdf.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    await renderEditor();
    const pdf = await screen.findByRole("button", { name: "Download PDF" });

    await user.click(pdf);
    expect(mocks.exportPdf).toHaveBeenCalledWith("7001");
    await waitFor(() => expect(pdf).toHaveAttribute("aria-busy", "true"));
    expect(
      screen.getByText("Preparing your PDF. This can take a few seconds."),
    ).toHaveAttribute("aria-live", "polite");
    expect(pdf).toHaveFocus();

    finish({
      blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      filename: "backend-cv.pdf",
    });
    await waitFor(() => expect(pdf).not.toHaveAttribute("aria-busy"));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("shows no id, a load failure with Retry, and the loading skeleton", async () => {
    const user = userEvent.setup();
    setLocation("/cvs/editor");
    const { unmount } = await renderEditor();
    expect(screen.getByText("No CV selected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to CVs" })).toHaveAttribute(
      "href",
      "/cvs",
    );
    expect(mocks.get).not.toHaveBeenCalled();
    unmount();

    setLocation("/cvs/editor?id=7001");
    mocks.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { detail: "CV store is down" } },
    });
    await renderEditor();
    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading this master CV");
    expect(await screen.findByText("CV store is down")).toBeInTheDocument();
    expect(screen.getByText("Could not load this CV")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByDisplayValue("Ada Lovelace")).toBeInTheDocument();
  });

  it("without cvs: page not found and no CV request", async () => {
    await renderEditor([{ key: "jobs", stage: "beta" }]);
    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("crossing md swaps to today's editor, which reseeds from the stored CV: an unsaved edit is lost (the editor has no autosave)", async () => {
    const user = userEvent.setup();
    mocks.features.current = CVS;
    const { viewport } = renderShellAcrossMd("/cvs/editor", <CvEditorPage />, {
      features: CVS,
    });
    const fullName = await screen.findByDisplayValue("Ada Lovelace");
    await user.clear(fullName);
    await user.type(fullName, "Unsaved name");
    expect(screen.getByDisplayValue("Unsaved name")).toBeInTheDocument();

    viewport.setPhone(false);

    expect(document.querySelector('[data-slot="phone-cv-editor"]')).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit master CV" }),
    ).toBeInTheDocument();
    expect(await screen.findAllByDisplayValue("Ada Lovelace")).not.toHaveLength(
      0,
    );
    expect(screen.queryByDisplayValue("Unsaved name")).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
