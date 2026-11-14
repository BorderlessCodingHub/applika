import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEventHandler } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewCvPage } from "@/app/(protected)/cvs/new/new-cv-page";
import {
  baseCvSchema,
  emptyBaseCvValues,
} from "@/components/base-cvs/base-cv-schema";
import { CV_FORM_SECTION_IDS } from "@/components/base-cvs/cv-form-sections";
import type { CvFormValues } from "@/components/base-cvs/types";
import type { MyFeature } from "@/services/types/features";
import { pathname, routerPush } from "@/test/navigation";
import {
  SAM,
  renderPhoneScreen,
  renderShellAcrossMd,
} from "@/test/phone-screens";

import { CvNewScreenView, type CvNewScreenViewProps } from "./cv-new-screen";

/**
 * `/cvs/new` below md: v3/CVNew on the page's own form, count query and
 * create mutation. The sections are rows with their descriptions, Identity
 * open first; the live preview is today's `CvDocumentPreview` in the board's
 * card (jsdom = one sheet, the no-measurement contract); the layout notice is
 * said once, as its caption; at three master CVs, the limit card and no form.
 */

const mocks = vi.hoisted(() => ({
  features: { current: [] as MyFeature[] },
  list: vi.fn(),
  create: vi.fn(),
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
      create: (...args: unknown[]) => mocks.create(...args),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

const CVS: MyFeature[] = [{ key: "cvs", stage: "beta" }];
const NOTICE = "Preview does not show the final PDF layout.";
const LIMIT =
  "You already have 3 master CVs — the limit is three. Delete one to create another.";

/** v3/CVNew's rows (CVNew.dc.html l.136-144): title and description. */
const ROWS: [id: string, title: string, description: string][] = [
  [
    "identity",
    "Identity and contact",
    "The header at the top of your CV, plus the label you recognise this CV by.",
  ],
  ["links", "Links", "Portfolio, GitHub, LinkedIn and other profiles."],
  ["summary", "Summary", "A short professional summary, in your own words."],
  [
    "skills",
    "Skills",
    "Group your skills into categories. Each category prints as its own line.",
  ],
  ["experience", "Experience", "Your roles, most recent first."],
  ["projects", "Projects", "Side projects, open source and notable work."],
  ["education", "Education", "Degrees and diplomas, most recent first."],
  [
    "certifications",
    "Certifications",
    "Professional certifications and licences.",
  ],
  ["languages", "Languages", "The languages you speak and how well."],
];

const board = () =>
  document.querySelector<HTMLElement>('[data-slot="phone-cv-new"]');
const row = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-slot="cv-acc"][data-section="${id}"]`,
  )!;

function View({
  onSubmit = (event) => event.preventDefault(),
  ...props
}: Partial<Omit<CvNewScreenViewProps, "form">>) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(baseCvSchema),
    defaultValues: emptyBaseCvValues(),
  });
  return (
    <CvNewScreenView
      beta
      countLoading={false}
      atLimit={false}
      form={form}
      onSubmit={onSubmit as FormEventHandler<HTMLFormElement>}
      creating={false}
      {...props}
    />
  );
}

beforeEach(() => {
  mocks.features.current = CVS;
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.create.mockReset().mockResolvedValue({ id: "9" });
  mocks.toastError.mockReset();
  routerPush.mockReset();
  pathname.current = "/cvs/new";
});

describe("CvNewScreenView (v3/CVNew)", () => {
  it("draws the board's form: the head, nine rows with descriptions, Identity open first", () => {
    render(<View />);

    const root = board()!;
    expect(root.tagName).toBe("FORM");
    expect(root).toHaveAttribute("data-state", "form");
    expect(root).toHaveAttribute("novalidate");
    expect(root).toHaveClass("ph-app", "ph-ce", "ph-cn");
    expect(
      screen.getByRole("heading", { level: 1, name: "New master CV" }),
    ).toHaveClass("ph-h1", "ph-h1-26");
    expect(
      screen.getByText(
        "Write it once. Every application you tailor starts from here.",
      ),
    ).toHaveClass("ph-lead");
    expect(
      screen.getByText("Beta").closest('[data-slot="phone-pill"]'),
    ).not.toBeNull();

    expect(
      [...document.querySelectorAll('[data-slot="cv-acc"]')].map((item) =>
        item.getAttribute("data-section"),
      ),
    ).toEqual([...CV_FORM_SECTION_IDS]);
    expect(ROWS.map(([id]) => id)).toEqual([...CV_FORM_SECTION_IDS]);
    for (const [id, title, description] of ROWS) {
      const toggle = screen.getByRole("button", { name: title });
      expect(toggle, id).toHaveClass("ph-acc");
      expect(toggle, id).toHaveAccessibleDescription(description);
      expect(toggle.closest("h2"), id).not.toBeNull();
      expect(toggle, id).toHaveAttribute(
        "aria-expanded",
        id === "identity" ? "true" : "false",
      );
    }
    expect(row("identity")).toHaveAttribute("data-open");
  });

  it("opens Identity with today's six fields in the board's order, the panel without the description", () => {
    render(<View />);
    const panel = within(row("identity").querySelector(".ph-ce-panel")!);

    expect(
      panel.getAllByRole("textbox").map((input) => input.getAttribute("name")),
    ).toEqual(["name", "full_name", "headline", "email", "phone", "location"]);
    for (const label of [
      "CV label",
      "Full name",
      "Headline",
      "Email",
      "Phone",
      "Location",
    ]) {
      expect(panel.getByLabelText(label)).toBeInTheDocument();
    }
    expect(panel.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(panel.getByLabelText("Phone")).toHaveAttribute("type", "tel");
    expect(panel.queryByText(ROWS[0][2])).toBeNull();
  });

  it("keeps one row open at a time; an empty list shows its hint and Add, not the description", async () => {
    const user = userEvent.setup();
    render(<View />);

    await user.click(screen.getByRole("button", { name: "Links" }));

    expect(
      screen.getByRole("button", { name: "Identity and contact" }),
    ).toHaveAttribute("aria-expanded", "false");
    const links = within(row("links").querySelector(".ph-ce-panel")!);
    expect(
      links.getByText("No links yet. Add the profiles you want on your CV."),
    ).toBeInTheDocument();
    expect(links.getByRole("button", { name: "Add link" })).toBeInTheDocument();
    expect(
      links.queryByText("Portfolio, GitHub, LinkedIn and other profiles."),
    ).toBeNull();
  });

  it("draws the Live preview card: today's live preview, one A4 sheet, 1 / 1, the notice once as the caption", () => {
    render(<View />);

    const card = screen.getByRole("region", { name: "Live preview" });
    expect(card).toHaveAttribute("data-slot", "cv-new-preview");
    expect(card).toHaveClass("ph-card", "ph-cn-pv");
    expect(
      within(card).getByRole("heading", { level: 2, name: "Live preview" }),
    ).toHaveClass("ph-cn-pv-h");
    const figures = within(card).getAllByRole("figure");
    expect(figures).toHaveLength(1);
    expect(figures[0]).toHaveClass("ph-cn-figure");
    expect(
      within(card).getByRole("group", { name: "CV preview pages" }),
    ).toBeInTheDocument();
    expect(card.querySelectorAll('[data-slot="cv-document"]')).toHaveLength(1);
    expect(card.querySelectorAll('[data-slot="cv-page"]')).toHaveLength(1);
    expect(card).toHaveTextContent("1 / 1");
    expect(within(card).getByText("Page 1 of 1")).toBeInTheDocument();

    // The notice is said once on the page, as the figure's caption.
    const notices = screen.getAllByText(NOTICE);
    expect(notices).toHaveLength(1);
    expect(notices[0].closest("figcaption")).toBe(
      figures[0].querySelector("figcaption"),
    );
    // The preview follows the rows.
    expect(
      row("languages").compareDocumentPosition(card) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("previews the form live as the user types", async () => {
    const user = userEvent.setup();
    render(<View />);

    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");

    await waitFor(() =>
      expect(
        screen
          .getByRole("region", { name: "Live preview" })
          .querySelector('[data-slot="cv-page"]'),
      ).toHaveTextContent("Ada Lovelace"),
    );
  });

  it("ends with the board's bar: Cancel to /cvs and Create CV, which submits the form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(<View onSubmit={onSubmit} />);

    const bar = document.querySelector<HTMLElement>(
      '[data-slot="phone-action-bar"]',
    )!;
    expect(bar).toHaveClass("ph-bar");
    expect(board()).toContainElement(bar);
    const cancel = within(bar).getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/cvs");
    expect(cancel).toHaveClass("ph-btn", "ph-sec");
    const create = within(bar).getByRole("button", { name: "Create CV" });
    expect(create).toHaveAttribute("type", "submit");
    expect(create).toHaveClass("ph-btn", "ph-pri");
    expect(
      cancel.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(create);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("while creating: Create CV and Cancel aria-disabled, Create busy, a tap does nothing, fields locked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(<View creating onSubmit={onSubmit} />);

    const create = screen.getByRole("button", { name: "Create CV" });
    expect(create).toHaveAttribute("aria-disabled", "true");
    expect(create).toHaveAttribute("aria-busy", "true");
    expect(create).not.toBeDisabled();
    expect(create.querySelector(".ph-spin")).not.toBeNull();
    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("aria-disabled", "true");

    await user.click(create);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Full name")).toBeDisabled();
  });

  it("at three master CVs: the limit sentence and Back to CVs, no form and no bar", () => {
    render(<View atLimit />);

    const root = board()!;
    expect(root.tagName).toBe("DIV");
    expect(root).toHaveAttribute("data-state", "limit");
    expect(root).toHaveClass("ph-app", "ph-ce", "ph-ce-nobar", "ph-cn");
    expect(
      screen.getByRole("heading", { level: 1, name: "New master CV" }),
    ).toBeInTheDocument();
    const limit = screen.getByRole("status");
    expect(limit).toHaveAttribute("data-slot", "cv-new-limit");
    expect(limit).toHaveClass("ph-cn-limit");
    expect(within(limit).getByText(LIMIT)).toHaveClass("ph-cn-limit-t");
    const back = within(limit).getByRole("link", { name: "Back to CVs" });
    expect(back).toHaveAttribute("href", "/cvs");
    expect(back).toHaveClass("ph-btn", "ph-sec");

    expect(document.querySelector("form")).toBeNull();
    expect(document.querySelector('[data-slot="cv-acc"]')).toBeNull();
    expect(document.querySelector('[data-slot="phone-action-bar"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Create CV" })).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("while the count loads: the skeleton, neither the form nor the limit card", () => {
    render(<View countLoading atLimit />);

    expect(board()).toHaveAttribute("data-state", "loading");
    const skeleton = document.querySelector<HTMLElement>(
      '[data-slot="phone-skeleton"]',
    )!;
    expect(skeleton).toHaveAttribute("role", "status");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent("Loading your master CVs");
    expect(document.querySelector("form")).toBeNull();
    expect(document.querySelector('[data-slot="cv-acc"]')).toBeNull();
    expect(document.querySelector('[data-slot="cv-new-limit"]')).toBeNull();
    expect(document.querySelector('[data-slot="phone-action-bar"]')).toBeNull();
  });

  it("shows no Beta once CVs are released", () => {
    render(<View beta={false} />);
    expect(screen.queryByText("Beta")).toBeNull();
  });
});

const renderNewCv = (features: MyFeature[] = CVS) => {
  mocks.features.current = features;
  return renderPhoneScreen("/cvs/new", <NewCvPage />, { features });
};

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("CV label"), "Backend CV");
  await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Headline"), "Senior Engineer");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Location"), "London");
  await user.click(screen.getByRole("button", { name: "Summary" }));
  await user.type(
    screen.getByRole("textbox", { name: "Summary" }),
    "Eight years on payments.",
  );
}

describe("the new master CV page below md", () => {
  it("renders the board inside the shell: back CVs, Beta in the bar, the rows and the preview", async () => {
    await renderNewCv();

    // The shell's bar (the CV sheet's own <header> reads as a banner in jsdom).
    const bar = document.querySelector<HTMLElement>(
      '[data-slot="phone-top-bar"]',
    )!;
    expect(within(bar).getByRole("link", { name: "CVs" })).toHaveAttribute(
      "href",
      "/cvs",
    );
    expect(
      (await within(bar).findByText("Beta")).closest(
        '[data-slot="phone-pill"]',
      ),
    ).not.toBeNull();
    await waitFor(() => expect(board()).toHaveAttribute("data-state", "form"));
    expect(
      screen.getByRole("heading", { level: 1, name: "New master CV" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="cv-acc"]')).toHaveLength(9);
    expect(
      screen.getByRole("region", { name: "Live preview" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    // Today's desktop editor is not mounted.
    expect(document.querySelector("aside")).toBeNull();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("creates the CV through today's mutation and returns to /cvs", async () => {
    const user = userEvent.setup();
    await renderNewCv();

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create CV" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      name: "Backend CV",
      full_name: "Ada Lovelace",
      headline: "Senior Engineer",
      email: "ada@example.com",
      location: "London",
      phone: null,
      summary: "Eight years on payments.",
      links: [],
    });
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/cvs"));
  });

  it("keeps today's 409 toast, in the API's words", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "Base CV limit reached (max 3 per user)" },
      },
    });
    await renderNewCv();

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create CV" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Base CV limit reached (max 3 per user)",
      ),
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("an invalid submit opens the failing section, Needs a fix, and sends nothing", async () => {
    const user = userEvent.setup();
    await renderNewCv();
    await screen.findByLabelText("CV label");
    await user.click(screen.getByRole("button", { name: "Links" }));

    await user.click(screen.getByRole("button", { name: "Create CV" }));

    const identity = screen.getByRole("button", {
      name: "Identity and contact",
    });
    await waitFor(() =>
      expect(identity).toHaveAttribute("aria-expanded", "true"),
    );
    expect(identity).toHaveAccessibleDescription("Needs a fix");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("tells a half-filled section row in today's toast", async () => {
    const user = userEvent.setup();
    await renderNewCv();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Certifications" }));
    await user.click(screen.getByRole("button", { name: "Add certification" }));
    await user.type(
      within(
        screen.getByRole("group", { name: "certification 1" }),
      ).getByLabelText("Issuer"),
      "Amazon Web Services",
    );

    await user.click(screen.getByRole("button", { name: "Create CV" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Every certification needs a name and an issuer. Remove the rows you do not want.",
      ),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("at three master CVs: the limit card, no form", async () => {
    mocks.list.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);
    await renderNewCv();

    expect(await screen.findByText(LIMIT)).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-state", "limit");
    expect(screen.getByRole("link", { name: "Back to CVs" })).toHaveAttribute(
      "href",
      "/cvs",
    );
    expect(document.querySelector("form")).toBeNull();
  });

  it("without cvs: page not found and no CV request", async () => {
    await renderNewCv([{ key: "jobs", stage: "beta" }]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(board()).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("crossing md swaps to today's editor and remounts the form: an unsaved new master CV is lost", async () => {
    const user = userEvent.setup();
    mocks.features.current = CVS;
    const { viewport } = renderShellAcrossMd("/cvs/new", <NewCvPage />, {
      features: CVS,
    });
    const label = await screen.findByLabelText("CV label");
    expect(board()).not.toBeNull();
    await user.type(label, "Unsaved CV");
    await user.type(screen.getByLabelText("Full name"), "Unsaved name");
    expect(screen.getByDisplayValue("Unsaved name")).toBeInTheDocument();

    viewport.setPhone(false);

    expect(board()).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 1, name: "New master CV" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("CV label")).toHaveValue("");
    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(screen.queryByDisplayValue("Unsaved CV")).toBeNull();
    expect(screen.queryByDisplayValue("Unsaved name")).toBeNull();
    // Today's editor says the notice once, as its preview's caption.
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
