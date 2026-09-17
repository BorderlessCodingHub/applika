import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CvEditorPage } from "./cv-editor-page";
import type { BaseCv } from "@/services/types/base-cv";

/**
 * `/cvs/editor?id=` (KODI-002 / R-001, R-003).
 *
 * AC3 — the page shows one of the user's own master CVs and saves changes back.
 * It also pins the id round trip: the client-generated section item ids that
 * came off the wire are the ones that go back onto it.
 */

const getMock = vi.fn();
const updateMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams("id=7001");

vi.mock("@/services/services", () => ({
  services: {
    baseCvs: {
      get: (...args: unknown[]) => getMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      list: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const SAVED_CV: BaseCv = {
  id: "7001",
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: "+44 20 7946 0958",
  summary: "Eight years on payment systems.",
  links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
  skills: ["Python"],
  experience: [
    {
      id: "e-1",
      company: "Stripe",
      role: "Senior Backend Engineer",
      period: "2021 — Present",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [],
  certifications: [],
  languages: [{ id: "g-1", name: "English", level: "Native" }],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CvEditorPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams("id=7001");
  getMock.mockResolvedValue(SAVED_CV);
  updateMock.mockResolvedValue(SAVED_CV);
});

describe("CvEditorPage", () => {
  it("opens the CV named by the query string, with its values in the form", async () => {
    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith("7001"));
    expect(await screen.findByLabelText("CV label")).toHaveValue("Backend CV");
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Phone")).toHaveValue("+44 20 7946 0958");
    expect(screen.getByLabelText("Add a skill")).toBeInTheDocument();
  });

  it("saves the change back and keeps every section item id", async () => {
    const user = userEvent.setup();
    renderPage();

    const label = await screen.findByLabelText("CV label");
    await user.clear(label);
    await user.type(label, "Platform CV");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [id, payload] = updateMock.mock.calls[0];
    expect(id).toBe("7001");
    expect(payload.name).toBe("Platform CV");
    expect(payload.links[0].id).toBe("l-1");
    expect(payload.experience[0].id).toBe("e-1");
    expect(payload.languages[0].id).toBe("g-1");
    // Server-owned fields never travel back.
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updated_at");

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/cvs"));
  });

  it("says so, and asks for nothing, when the URL names no CV", async () => {
    searchParams = new URLSearchParams();
    renderPage();

    expect(await screen.findByText("No CV selected")).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("surfaces the API message when the CV cannot be loaded", async () => {
    getMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { detail: "Base CV not found" } },
    });
    renderPage();

    expect(await screen.findByText("Base CV not found")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });
});
