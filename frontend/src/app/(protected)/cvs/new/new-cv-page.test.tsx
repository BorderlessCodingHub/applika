import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewCvPage } from "./new-cv-page";
import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import type { MyFeature } from "@/services/types/features";
import { NEW_CV_COPY } from "@/components/base-cvs/new-cv-card";

/**
 * `/cvs/new` (KODI-002 / R-001, R-002).
 *
 * AC1 — the form captures the label, the identity and contact block, the
 * summary and the sections, and sends them to the API.
 * AC2 — when the API refuses the create with 409, the user is told, in the
 * API's own words.
 */

const listMock = vi.fn();
const createMock = vi.fn();
const pushMock = vi.fn();

/** The caller's features: `cvs` in beta unless a test says otherwise. */
let myFeatures: MyFeature[] = [{ key: "cvs", stage: "beta" }];
const getMyFeatures = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: (...args: unknown[]) => getMyFeatures(...args) },
    baseCvs: {
      list: (...args: unknown[]) => listMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

/** The API's own words when the cap is hit, straight out of the contract. */
const LIMIT_DETAIL = "Base CV limit reached (max 3 per user)";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(MY_FEATURES_QUERY_KEY, myFeatures);
  return render(
    <QueryClientProvider client={client}>
      <NewCvPage />
    </QueryClientProvider>,
  );
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  // The page waits for the CV count before it decides between the form and the
  // limit panel, so the form arrives one tick after the render.
  await user.type(await screen.findByLabelText("CV label"), "Backend CV");
  await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Headline"), "Senior Engineer");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Location"), "London");
  await user.type(screen.getByLabelText("Summary"), "Eight years on payments.");
}

beforeEach(() => {
  vi.clearAllMocks();
  myFeatures = [{ key: "cvs", stage: "beta" }];
  getMyFeatures.mockImplementation(async () => myFeatures);
  listMock.mockResolvedValue([]);
});

describe("NewCvPage", () => {
  it("sends the whole CV to the API and returns to the list", async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({ id: "9" });
    renderPage();

    await fillRequired(user);
    // Skills are CATEGORIES with keywords inside, not a flat tag list.
    await user.click(screen.getByRole("button", { name: "Add category" }));
    const category = within(screen.getByRole("group", { name: "category 1" }));
    await user.type(
      category.getByLabelText("Category"),
      "Languages and frameworks",
    );
    await user.type(
      category.getByLabelText("Add a keyword to Languages and frameworks"),
      "Python{Enter}",
    );
    // "Highlight" is the UI's word for what the wire calls `bullets`; a
    // mis-wired input would otherwise pass the whole suite.
    await user.click(screen.getByRole("button", { name: "Add experience" }));
    const role = within(screen.getByRole("group", { name: "experience 1" }));
    await user.type(role.getByLabelText("Company"), "Applika");
    await user.type(role.getByLabelText("Role"), "Backend Engineer");
    // A current role: the start is required, the finish left empty.
    await user.type(role.getByLabelText("Start"), "012024");
    await user.click(role.getByRole("button", { name: "Add highlight" }));
    await user.type(
      role.getByLabelText("Highlight 1"),
      "Cut settlement latency by 40%",
    );

    await user.click(screen.getByRole("button", { name: "Add certification" }));
    const certification = within(
      screen.getByRole("group", { name: "certification 1" }),
    );
    await user.type(certification.getByLabelText("Name"), "AWS SAA");
    await user.type(
      certification.getByLabelText("Issuer"),
      "Amazon Web Services",
    );
    await user.click(screen.getByRole("button", { name: "Create CV" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0]).toMatchObject({
      name: "Backend CV",
      full_name: "Ada Lovelace",
      headline: "Senior Engineer",
      email: "ada@example.com",
      // The form spells "no phone" as "", the wire spells it null.
      phone: null,
      location: "London",
      summary: "Eight years on payments.",
      skills: [
        {
          id: expect.any(String),
          category: "Languages and frameworks",
          keywords: ["Python"],
        },
      ],
      links: [],
      projects: [],
      education: [],
      languages: [],
    });
    expect(createMock.mock.calls[0][0].experience).toEqual([
      {
        id: expect.any(String),
        company: "Applika",
        role: "Backend Engineer",
        start: "2024-01",
        end: undefined,
        company_description: undefined,
        location: undefined,
        bullets: ["Cut settlement latency by 40%"],
      },
    ]);
    expect(createMock.mock.calls[0][0].certifications).toEqual([
      {
        id: expect.any(String),
        name: "AWS SAA",
        issuer: "Amazon Web Services",
      },
    ]);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/cvs"));
  });

  it("tells the user, in the API's words, when the API refuses a fourth CV", async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: LIMIT_DETAIL } },
    });
    renderPage();

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create CV" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(LIMIT_DETAIL));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not call the API at all while a required field is missing", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Create CV" }));

    expect(await screen.findByText("A CV label is required")).toBeVisible();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("says why it will not send a half-filled section row", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillRequired(user);
    // A row with something in it has to be complete: the API requires both
    // fields, and a section list has no inline error slot of its own.
    // "Highlight" is the UI's word for what the wire calls `bullets`; a
    // mis-wired input would otherwise pass the whole suite.
    await user.click(screen.getByRole("button", { name: "Add experience" }));
    const role = within(screen.getByRole("group", { name: "experience 1" }));
    await user.type(role.getByLabelText("Company"), "Applika");
    await user.type(role.getByLabelText("Role"), "Backend Engineer");
    // A current role: the start is required, the finish left empty.
    await user.type(role.getByLabelText("Start"), "012024");
    await user.click(role.getByRole("button", { name: "Add highlight" }));
    await user.type(
      role.getByLabelText("Highlight 1"),
      "Cut settlement latency by 40%",
    );

    await user.click(screen.getByRole("button", { name: "Add certification" }));
    await user.type(
      within(
        screen.getByRole("group", { name: "certification 1" }),
      ).getByLabelText("Issuer"),
      "Amazon Web Services",
    );
    await user.click(screen.getByRole("button", { name: "Create CV" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Every certification needs a name and an issuer. Remove the rows you do not want.",
      ),
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("ignores a section row the user added and never filled in", async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({ id: "9" });
    renderPage();

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.click(screen.getByRole("button", { name: "Create CV" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].links).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("refuses to open the form at all once three CVs exist, saying why", async () => {
    listMock.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);
    renderPage();

    expect(await screen.findByText(NEW_CV_COPY.limitReason)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Create CV" }),
    ).not.toBeInTheDocument();
  });
});

describe("NewCvPage behind the cvs feature (PRD 0015)", () => {
  it("shows the app's page not found and asks for no CV without cvs", async () => {
    myFeatures = [{ key: "jobs", stage: "beta" }];
    renderPage();

    expect(await screen.findByText("Oops! Page not found")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "New master CV" }),
    ).not.toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("puts the Beta badge beside the h1, never inside it, while cvs is in beta", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "New master CV",
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
      await screen.findByRole("heading", { level: 1, name: "New master CV" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });
});
