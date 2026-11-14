import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationCvPage } from "@/app/(protected)/applications/cv/application-cv-page";
import type { CvFormDiffSlots } from "@/components/base-cvs/cv-form-diff";
import type { BaseCv, CvFormValues } from "@/components/base-cvs/types";
import {
  emptyTailoredCvValues,
  tailoredCvSchema,
} from "@/components/tailored-cvs/tailored-cv-schema";
import type { Application } from "@/services/types/applications";
import type { MyFeature } from "@/services/types/features";
import type { TailoredCv } from "@/services/types/tailored-cv";
import { pathname, setLocation } from "@/test/navigation";
import { mockPhoneViewport } from "@/test/phone";
import {
  PickPastCycle,
  SAM,
  renderPhoneScreen,
  renderShellAcrossMd,
} from "@/test/phone-screens";

import {
  ApplicationCvScreenView,
  type ApplicationCvEditorSlots,
  type ApplicationCvPickerSlots,
  type ApplicationCvScreenViewProps,
} from "./application-cv-screen";

/**
 * `/applications/cv?id=` below md: v3/ApplicationCV on the page's own state.
 * The picker (native radios, the card actions beside them, the new tile,
 * Tailor by keywords) before a copy exists; the copy's editor (source, job
 * description, fit, Changes, the nine rows, downloads, Delete copy, Save)
 * once it does; a closed or archived application reads it only.
 */

const mocks = vi.hoisted(() => ({
  features: { current: [] as MyFeature[] },
  getApplications: vi.fn(),
  getCopy: vi.fn(),
  createCopy: vi.fn(),
  updateCopy: vi.fn(),
  removeCopy: vi.fn(),
  getFit: vi.fn(),
  exportCopyPdf: vi.fn(),
  exportCopyMarkdown: vi.fn(),
  exportDiffPdf: vi.fn(),
  exportDiffMarkdown: vi.fn(),
  listBaseCvs: vi.fn(),
  removeBaseCv: vi.fn(),
  exportBaseCvPdf: vi.fn(),
  exportBaseCvMarkdown: vi.fn(),
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
    applications: {
      getApplications: (...args: unknown[]) => mocks.getApplications(...args),
    },
    tailoredCvs: {
      get: (...args: unknown[]) => mocks.getCopy(...args),
      create: (...args: unknown[]) => mocks.createCopy(...args),
      update: (...args: unknown[]) => mocks.updateCopy(...args),
      remove: (...args: unknown[]) => mocks.removeCopy(...args),
      getFit: (...args: unknown[]) => mocks.getFit(...args),
      exportPdf: (...args: unknown[]) => mocks.exportCopyPdf(...args),
      exportMarkdown: (...args: unknown[]) => mocks.exportCopyMarkdown(...args),
      exportDiffPdf: (...args: unknown[]) => mocks.exportDiffPdf(...args),
      exportDiffMarkdown: (...args: unknown[]) =>
        mocks.exportDiffMarkdown(...args),
    },
    baseCvs: {
      list: (...args: unknown[]) => mocks.listBaseCvs(...args),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: (...args: unknown[]) => mocks.removeBaseCv(...args),
      exportPdf: (...args: unknown[]) => mocks.exportBaseCvPdf(...args),
      exportMarkdown: (...args: unknown[]) =>
        mocks.exportBaseCvMarkdown(...args),
    },
  },
}));

// Today's edit sheet is tested on its own (application-form-sheet.test.tsx):
// here it only has to open, and to be gone once the page remounts.
vi.mock("@/components/applications/application-form-sheet", () => ({
  ApplicationFormSheet: ({
    open,
    application,
  }: {
    open: boolean;
    application: Application;
  }) =>
    open ? (
      <div role="dialog" aria-label="Edit Application">
        {application.company_name}
      </div>
    ) : null,
}));

function masterCv(id: string, name: string, extra: Partial<BaseCv> = {}) {
  return {
    id,
    name,
    full_name: "Sam Carter",
    headline: "Senior Backend Engineer",
    location: "Lisbon",
    email: "sam@example.com",
    phone: null,
    summary: "Eight years on payment systems.",
    links: [],
    skills: [
      {
        id: `${id}-s1`,
        category: "Backend",
        keywords: ["Python", "FastAPI", "PostgreSQL"],
      },
    ],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    languages: [],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-30T12:00:00Z",
    ...extra,
  } satisfies BaseCv;
}

const BACKEND = masterCv("7", "Backend 2026", {
  experience: [
    {
      id: "e1",
      company: "Northwind",
      role: "Engineer",
      start: "2022-01",
      bullets: ["Shipped it"],
    },
  ],
});
const FULLSTACK = masterCv("8", "Full-stack", {
  full_name: "Sam Carter",
  headline: "",
  skills: [],
});

const COPY_VALUES: CvFormValues = {
  ...emptyTailoredCvValues(),
  name: "Backend 2026",
  full_name: "Sam Carter",
  headline: "Senior Backend Engineer",
  email: "sam@example.com",
  location: "Lisbon",
  summary: "Eight years on payment systems.",
  skills: [
    {
      id: "k1",
      category: "Backend",
      keywords: ["PostgreSQL", "Python", "FastAPI"],
    },
  ],
};

const ADJUSTMENTS = [
  {
    section: "skills",
    description: "Keywords reordered by job match in 1 category",
  },
  {
    section: "experience",
    description: "Bullets reordered by job match in 1 role",
  },
];

function pickerSlots(
  over: Partial<ApplicationCvPickerSlots> = {},
): ApplicationCvPickerSlots {
  return {
    masterCvs: { status: "ready", data: [BACKEND, FULLSTACK] },
    selectedId: null,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    creating: false,
    tailorByKeywords: false,
    onTailorByKeywordsChange: vi.fn(),
    onDelete: vi.fn(),
    deletingId: null,
    onExportPdf: vi.fn(),
    exportingPdfId: null,
    onExportMarkdown: vi.fn(),
    exportingMarkdownId: null,
    ...over,
  };
}

type CopySlots = Partial<Omit<ApplicationCvEditorSlots, "form">>;

function editorSlots(
  form: ApplicationCvEditorSlots["form"],
  over: CopySlots,
): ApplicationCvEditorSlots {
  return {
    form,
    onSubmit: vi.fn((event) => event.preventDefault()),
    saving: false,
    sourceDeleted: false,
    sourceCvName: "Backend 2026",
    jobDescription: "Northwind builds logistics software on PostgreSQL.",
    onAddJobDescription: vi.fn(),
    fit: {
      data: {
        score: 72,
        matched_keywords: ["Python", "PostgreSQL"],
        missing_keywords: ["gRPC"],
      },
      loading: false,
      error: false,
      onRetry: vi.fn(),
      retrying: false,
      dirty: false,
    },
    changes: {
      baseline: {
        label: "Backend 2026",
        count: 6,
        showChanges: false,
        onShowChangesChange: vi.fn(),
      },
      onExportPdf: vi.fn(),
      onExportMarkdown: vi.fn(),
      exportingPdf: false,
      exportingMarkdown: false,
      disabledReason: null,
    },
    diff: undefined,
    sectionChanges: undefined,
    adjustments: ADJUSTMENTS,
    onExportPdf: vi.fn(),
    exportingPdf: false,
    onExportMarkdown: vi.fn(),
    exportingMarkdown: false,
    onDelete: vi.fn(),
    deleting: false,
    ...over,
  };
}

type ViewProps = Partial<Omit<ApplicationCvScreenViewProps, "editor">> & {
  /** The copy's slots (the form is made here); `null` while no copy is read. */
  copy?: CopySlots | null;
};

/** The view with a stable form, as the page holds one across renders. */
function View({ copy = null, ...over }: ViewProps) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(tailoredCvSchema),
    defaultValues: COPY_VALUES,
  });
  return (
    <ApplicationCvScreenView
      beta
      applicationId="42"
      applicationLoading={false}
      application={{
        role: "Senior Backend Engineer",
        company_name: "Northwind Labs",
      }}
      applicationError={null}
      readOnlyReason={null}
      noCopyYet={copy === null}
      copyError={null}
      copyLoading={false}
      picker={pickerSlots()}
      editor={copy ? editorSlots(form, copy) : null}
      {...over}
    />
  );
}

const root = () =>
  document.querySelector<HTMLElement>('[data-slot="phone-application-cv"]');
const row = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-slot="cv-acc"][data-section="${id}"]`,
  )!;

beforeEach(() => {
  // `PhoneSheetFrame` closes a sheet left open at desktop width.
  mockPhoneViewport();
});

describe("ApplicationCvScreenView: head and messages", () => {
  it("draws the head: h1 Application CV, the lead role · company, Beta", () => {
    render(<View />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Application CV" }),
    ).toHaveClass("ph-h1", "ph-h1-26");
    expect(
      screen.getByText("Senior Backend Engineer · Northwind Labs"),
    ).toHaveClass("ph-lead");
    // Outside the shell `PhoneTopBarEnd` renders in place.
    expect(
      screen.getByText("Beta").closest('[data-slot="phone-pill"]'),
    ).not.toBeNull();
    expect(root()).toHaveClass("ph-app", "ph-ce", "ph-acv");
  });

  it("says the page's description with no application, and no Beta once CVs are released", () => {
    render(<View beta={false} applicationId={null} application={null} />);

    expect(
      screen.getByText(
        "This application's own copy of a master CV, edited for the job.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("no id: today's message in a card with Back to applications, no alert, no bar", () => {
    render(<View applicationId={null} application={null} />);

    expect(root()).toHaveAttribute("data-state", "no-id");
    expect(root()).toHaveClass("ph-ce-nobar");
    const card = document.querySelector<HTMLElement>(
      '[data-slot="application-cv-message"]',
    )!;
    expect(card).toHaveClass("ph-card", "ph-ce-message");
    expect(card).toHaveTextContent(
      "No application selectedOpen an application from your list to work on its CV copy.",
    );
    expect(
      screen.getByRole("link", { name: "Back to applications" }),
    ).toHaveAttribute("href", "/applications");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loading the application, then the copy: the skeletons say today's words", () => {
    const { rerender } = render(<View applicationLoading application={null} />);
    expect(root()).toHaveAttribute("data-state", "loading-application");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading this application",
    );

    rerender(<View noCopyYet={false} copyLoading />);
    expect(root()).toHaveAttribute("data-state", "loading-copy");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading this CV copy",
    );
  });

  it("an application not in the viewed cycle, and a failed load, are alerts with today's words", () => {
    const { rerender } = render(<View application={null} />);
    expect(root()).toHaveAttribute("data-state", "open-error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not open this applicationIt is not in the cycle you are viewing. Switch cycles from the applications list and open its CV from there.",
    );

    rerender(<View application={null} applicationError="Server down" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not open this applicationServer down",
    );

    rerender(<View noCopyYet={false} copyError="Copy failed" />);
    expect(root()).toHaveAttribute("data-state", "copy-error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load this CV copyCopy failed",
    );
    expect(
      screen.getByRole("link", { name: "Back to applications" }),
    ).toBeInTheDocument();
  });
});

describe("ApplicationCvScreenView: the picker", () => {
  it("lists every master CV as a native radio of one group, named by the CV, described by its update and who", () => {
    render(<View />);

    expect(root()).toHaveAttribute("data-state", "picker");
    expect(
      screen.getByRole("region", { name: "Choose a master CV" }),
    ).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Choose a master CV" });
    expect(group).toHaveAccessibleDescription(
      "Pick the master CV this application starts from. The copy is yours to edit for this job — the master CV never changes.",
    );
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio.tagName).toBe("INPUT");
      expect(radio).toHaveAttribute("type", "radio");
    }
    expect(
      new Set(radios.map((radio) => radio.getAttribute("name"))).size,
    ).toBe(1);
    expect(
      within(group).getByRole("radio", { name: "Backend 2026" }),
    ).toHaveAccessibleDescription(
      "Updated Oct 30, 2026 Sam Carter · Senior Backend Engineer",
    );
    // No headline: the name alone.
    expect(
      within(group).getByRole("radio", { name: "Full-stack" }),
    ).toHaveAccessibleDescription("Updated Oct 30, 2026 Sam Carter");
    // No `radiogroup`: it may own only radios, and the actions are buttons.
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("draws each choice's keywords, counts and its four actions outside the label, with the board's names", () => {
    render(<View />);

    const card = document.querySelector<HTMLElement>('[data-cv-id="7"]')!;
    expect(card).toHaveClass("ph-pick", "ph-acv-choice");
    expect(
      Array.from(card.querySelectorAll(".ph-tag")).map(
        (tag) => tag.textContent,
      ),
    ).toEqual(["Python", "FastAPI", "PostgreSQL"]);
    expect(card.querySelector(".ph-cv-counts")).toHaveTextContent(
      "1 role · 0 projects · 0 languages · 3 keywords",
    );
    // A CV with no skills says so.
    expect(
      within(
        document.querySelector<HTMLElement>('[data-cv-id="8"]')!,
      ).getByText("No skills added yet"),
    ).toBeInTheDocument();

    const actions: [role: "button" | "link", name: string, text: string][] = [
      ["button", "Download PDF of Backend 2026", "PDF"],
      ["button", "Download Markdown of Backend 2026", "Markdown"],
      ["link", "Edit Backend 2026", "Edit"],
      ["button", "Delete Backend 2026", "Delete"],
    ];
    for (const [role, name, text] of actions) {
      const control = screen.getByRole(role, { name });
      expect(control, name).toHaveTextContent(text);
      expect(control.closest("label"), name).toBeNull();
      expect(card.contains(control), name).toBe(true);
    }
    expect(
      screen.getByRole("link", { name: "Edit Backend 2026" }),
    ).toHaveAttribute("href", "/cvs/editor?id=7");
    expect(
      screen.getByRole("button", { name: "Delete Backend 2026" }),
    ).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("offers the new master CV tile with the slots left, linking /cvs/new", () => {
    render(<View />);

    const tile = screen.getByRole("link", {
      name: "New master CV 1 of 3 slot left",
    });
    expect(tile).toHaveAttribute("href", "/cvs/new");
    expect(tile).toHaveClass("ph-cv-new", "ph-acv-new");
  });

  it("Create the CV copy stays aria-disabled until a listed CV is chosen; tapping a name chooses it", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots();
    const { rerender } = render(<View picker={picker} />);

    const create = screen.getByRole("button", { name: "Create the CV copy" });
    expect(create).toHaveAttribute("aria-disabled", "true");
    expect(create).not.toBeDisabled();
    await user.click(create);
    expect(picker.onCreate).not.toHaveBeenCalled();

    // The label row is the target: its visible name selects.
    await user.click(screen.getByText("Full-stack"));
    expect(picker.onSelect).toHaveBeenCalledWith("8");

    // An id that left the list selects nothing.
    rerender(<View picker={{ ...picker, selectedId: "gone" }} />);
    expect(
      screen.getByRole("button", { name: "Create the CV copy" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByRole("radio").some((radio) => radio.matches(":checked")),
    ).toBe(false);

    rerender(<View picker={{ ...picker, selectedId: "8" }} />);
    expect(screen.getByRole("radio", { name: "Full-stack" })).toBeChecked();
    expect(document.querySelector('[data-cv-id="8"]')).toHaveClass("ph-on");
    const ready = screen.getByRole("button", { name: "Create the CV copy" });
    expect(ready).not.toHaveAttribute("aria-disabled");
    await user.click(ready);
    expect(picker.onCreate).toHaveBeenCalledTimes(1);
  });

  it("while creating: Create busy, the radios and the card actions keep focus and ignore taps", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots({ selectedId: "7", creating: true });
    render(<View picker={picker} />);

    const create = screen.getByRole("button", { name: "Create the CV copy" });
    expect(create).toHaveAttribute("aria-busy", "true");
    expect(create).toHaveAttribute("aria-disabled", "true");
    await user.click(create);
    expect(picker.onCreate).not.toHaveBeenCalled();

    expect(screen.getByRole("radio", { name: "Full-stack" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(screen.getByText("Full-stack"));
    expect(picker.onSelect).not.toHaveBeenCalledWith("8");
    await user.click(
      screen.getByRole("button", { name: "Download PDF of Backend 2026" }),
    );
    expect(picker.onExportPdf).not.toHaveBeenCalled();
  });

  it("selects a lone master CV for the page (preselectedBaseCvId)", () => {
    const picker = pickerSlots({
      masterCvs: { status: "ready", data: [BACKEND] },
    });
    render(<View picker={picker} />);

    expect(picker.onSelect).toHaveBeenCalledWith("7");
  });

  it("at three master CVs: today's limit sentence in place of the tile", () => {
    render(
      <View
        picker={pickerSlots({
          masterCvs: {
            status: "ready",
            data: [BACKEND, FULLSTACK, masterCv("9", "Data")],
          },
        })}
      />,
    );

    expect(screen.queryByRole("link", { name: /New master CV/ })).toBeNull();
    expect(document.querySelector('[data-slot="cvs-limit"]')).toHaveTextContent(
      "You already have 3 master CVs — the limit is three. Delete one to create another.",
    );
  });

  it("with no master CV: /cvs's empty words and the tile, no group, no Tailor, no bar", () => {
    render(
      <View
        picker={pickerSlots({ masterCvs: { status: "ready", data: [] } })}
      />,
    );

    expect(screen.getByText("No master CVs yet")).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create the CV copy" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "New master CV 3 of 3 slots left" }),
    ).toBeInTheDocument();
    expect(root()).toHaveClass("ph-ce-nobar");
  });

  it("Tailor by keywords: only when the page passes it, a switch described by today's sentence, its label toggles it", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots();
    const { rerender } = render(<View picker={picker} />);

    const card = document.querySelector('[data-slot="tailor-by-keywords"]');
    expect(card).toHaveAttribute("data-state", "off");
    const toggle = screen.getByRole("switch", { name: "Tailor by keywords" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription(
      "Reorders skills and bullets by how well they match the job description. No text is added or changed.",
    );
    await user.click(screen.getByText("Tailor by keywords"));
    expect(picker.onTailorByKeywordsChange).toHaveBeenCalledWith(true);

    rerender(<View picker={{ ...picker, tailorByKeywords: true }} />);
    expect(
      screen.getByRole("switch", { name: "Tailor by keywords" }),
    ).toHaveAttribute("aria-checked", "true");

    rerender(
      <View picker={{ ...picker, onTailorByKeywordsChange: undefined }} />,
    );
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      document.querySelector('[data-slot="tailor-by-keywords"]'),
    ).toBeNull();
  });

  it("the list loading, then failing: today's words, Try again refetches", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <View picker={pickerSlots({ masterCvs: { status: "loading" } })} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your master CVs",
    );
    // The heading stays over the gallery state.
    expect(
      screen.getByRole("heading", { level: 2, name: "Choose a master CV" }),
    ).toBeInTheDocument();

    rerender(
      <View
        picker={pickerSlots({
          masterCvs: { status: "error", message: "Down", onRetry },
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load your master CVsDown",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("Delete {name}: the sheet, Deleting... while the page deletes, closed once the CV left the list", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots();
    const { rerender } = render(<View picker={picker} />);

    await user.click(
      screen.getByRole("button", { name: "Delete Backend 2026" }),
    );
    const sheet = screen.getByRole("alertdialog", {
      name: "Delete this master CV?",
    });
    expect(sheet).toHaveTextContent(
      '"Backend 2026" and everything in it is removed for good. This cannot be undone.',
    );
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    expect(picker.onDelete).toHaveBeenCalledWith(BACKEND);

    rerender(<View picker={{ ...picker, deletingId: "7" }} />);
    const pending = within(screen.getByRole("alertdialog")).getByRole(
      "button",
      { name: "Deleting..." },
    );
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-cv-id="7"]')).toHaveAttribute(
      "data-deleting",
    );

    rerender(
      <View
        picker={{
          ...picker,
          deletingId: null,
          masterCvs: { status: "ready", data: [FULLSTACK] },
        }}
      />,
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Choose a master CV" }),
      ),
    );
  });

  it("Cancel closes the master CV sheet and deletes nothing", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots();
    render(<View picker={picker} />);

    await user.click(screen.getByRole("button", { name: "Delete Full-stack" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    );

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(picker.onDelete).not.toHaveBeenCalled();
  });

  it("a card download: PDF and Markdown call the page, pending is busy and said in the one live region", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots();
    const { rerender } = render(<View picker={picker} />);

    await user.click(
      screen.getByRole("button", { name: "Download PDF of Backend 2026" }),
    );
    expect(picker.onExportPdf).toHaveBeenCalledWith(BACKEND);
    await user.click(
      screen.getByRole("button", { name: "Download Markdown of Full-stack" }),
    );
    expect(picker.onExportMarkdown).toHaveBeenCalledWith(FULLSTACK);

    rerender(<View picker={{ ...picker, exportingPdfId: "7" }} />);
    expect(
      screen.getByRole("button", { name: "Download PDF of Backend 2026" }),
    ).toHaveAttribute("aria-busy", "true");
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live).not.toHaveAttribute("role");
    expect(live).toHaveTextContent(
      "Preparing your PDF. This can take a few seconds.",
    );
  });

  it("a closed or archived application with no copy: the banner and today's words, nothing to choose", () => {
    const { rerender } = render(<View readOnlyReason="finalized" />);

    expect(root()).toHaveAttribute("data-state", "locked");
    expect(root()).toHaveClass("ph-ce-nobar");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "This application is closed.Reopen it to edit this CV.",
    );
    expect(
      screen.getByText(
        "No CV copy was created for this application, and one can no longer be created.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("link", { name: /New master CV/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create the CV copy" }),
    ).toBeNull();

    rerender(<View readOnlyReason="archived" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "This application is in a closed cycle",
    );
  });
});

describe("ApplicationCvScreenView: the copy's editor", () => {
  it("draws the board: source, job description, fit, Changes, nine closed rows, downloads, Delete copy, Save", () => {
    render(<View copy={{}} />);

    expect(root()).toHaveAttribute("data-state", "editor");
    expect(root()).not.toHaveClass("ph-ce-nobar");
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen
        .getByText("Copied from Backend 2026")
        .closest('[data-slot="phone-pill"]'),
    ).not.toBeNull();

    expect(
      screen.getByRole("region", { name: "Job description" }),
    ).toHaveTextContent(
      "Job descriptionFrom the application. Read-only here.Northwind builds logistics software on PostgreSQL.",
    );

    const fit = screen.getByRole("region", { name: "CV fit for this job" });
    expect(fit).toHaveAttribute("data-state", "ready");
    expect(within(fit).getByText("Fit 72%")).toBeInTheDocument();
    expect(
      within(fit).getByText(
        "Keyword match between the job description and this CV copy.",
      ),
    ).toBeInTheDocument();
    expect(
      within(fit).getByRole("list", { name: "Matched" }),
    ).toHaveTextContent("PythonPostgreSQL");
    const missing = within(fit).getByRole("list", { name: "Missing" });
    expect(missing).toHaveTextContent("gRPC");
    expect(missing.querySelector(".ph-tag")).toHaveClass("ph-miss");

    const changes = screen.getByRole("region", { name: "Changes" });
    const toggle = within(changes).getByRole("switch", {
      name: "Show changes",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription(
      "Compared with Backend 2026: 6 changes",
    );
    expect(changes.querySelector(".ph-acv-cmp .ph-mono")).toHaveTextContent(
      "6 changes",
    );
    // Show changes off: no moves list.
    expect(within(changes).queryByRole("list")).toBeNull();
    for (const [name, text] of [
      ["Download changes as PDF", "PDF"],
      ["Download changes as Markdown", "Markdown"],
    ]) {
      expect(within(changes).getByRole("button", { name })).toHaveTextContent(
        text,
      );
    }
    expect(
      within(changes).getByText("Downloads reflect the last saved version."),
    ).toBeInTheDocument();

    expect(document.querySelectorAll('[data-slot="cv-acc"]')).toHaveLength(9);
    expect(
      document.querySelectorAll('[data-slot="cv-acc"][data-open]'),
    ).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Skills" }),
    ).toHaveAccessibleDescription("1 group · 3 keywords · Reordered");
    expect(
      screen.getByRole("button", { name: "Experience" }),
    ).toHaveAccessibleDescription("None yet · Reordered");
    expect(
      screen.getByRole("button", { name: "Links" }),
    ).toHaveAccessibleDescription("None yet");
    // The board's meta line, l.214-215.
    expect(row("skills").querySelector(".ph-acc-m")).toHaveTextContent(
      "1 group · 3 keywords · Reordered",
    );

    const downloads = document.querySelector<HTMLElement>(
      '[data-slot="cv-copy-downloads"]',
    )!;
    expect(
      within(downloads)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Download PDF", "Download Markdown", "Delete copy"]);
    expect(screen.getByRole("button", { name: "Delete copy" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(
      screen.getByRole("button", { name: "Save CV copy" }),
    ).toHaveAttribute("type", "submit");
  });

  it("Show changes on: the sections reordered by job match by title, each row says Reordered once with its count", () => {
    const desktopStatus: CvFormDiffSlots = {
      field: () => undefined,
      sectionStatus: () => <span>reordered-from-desktop</span>,
      itemBadge: () => undefined,
      itemClassName: () => undefined,
      removedRows: () => undefined,
    };
    render(
      <View
        copy={{
          changes: {
            ...editorSlots({} as never, {}).changes!,
            baseline: {
              label: "Backend 2026",
              count: 2,
              showChanges: true,
              onShowChangesChange: vi.fn(),
            },
          },
          diff: desktopStatus,
          sectionChanges: { skills: 2 },
        }}
      />,
    );

    const moves = screen.getByRole("list", { name: "Reordered by job match" });
    expect(
      Array.from(moves.querySelectorAll("li[data-section]")).map((item) => [
        item.getAttribute("data-section"),
        item.textContent,
      ]),
    ).toEqual([
      ["skills", "Skills"],
      ["experience", "Experience"],
    ]);
    // `useCvDiff`'s "reordered" status is replaced: the row says it.
    expect(screen.queryByText("reordered-from-desktop")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Skills" }),
    ).toHaveAccessibleDescription("1 group · 3 keywords · Reordered 2 changes");
    expect(
      screen.getByRole("button", { name: "Experience" }),
    ).toHaveAccessibleDescription("None yet · Reordered");
  });

  it("Show changes and both diff downloads call the page; a refusal is aria-disabled and described by its reason", async () => {
    const user = userEvent.setup();
    const onShowChangesChange = vi.fn();
    const onExportPdf = vi.fn();
    const onExportMarkdown = vi.fn();
    const changes = {
      baseline: {
        label: null,
        count: 0,
        showChanges: false,
        onShowChangesChange,
      },
      onExportPdf,
      onExportMarkdown,
      exportingPdf: false,
      exportingMarkdown: false,
      disabledReason: null,
    };
    const { rerender } = render(<View copy={{ changes }} />);

    const toggle = screen.getByRole("switch", { name: "Show changes" });
    expect(toggle).toHaveAccessibleDescription(
      "Compared with the original master CV: no changes",
    );
    await user.click(screen.getByText("Show changes"));
    expect(onShowChangesChange).toHaveBeenCalledWith(true);
    await user.click(
      screen.getByRole("button", { name: "Download changes as PDF" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Download changes as Markdown" }),
    );
    expect(onExportPdf).toHaveBeenCalledTimes(1);
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);

    rerender(
      <View
        copy={{
          changes: {
            ...changes,
            disabledReason: "This CV copy has no baseline to compare with.",
          },
        }}
      />,
    );
    for (const name of [
      "Download changes as PDF",
      "Download changes as Markdown",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAccessibleDescription(
        "This CV copy has no baseline to compare with.",
      );
      await user.click(button);
    }
    expect(onExportPdf).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Downloads reflect the last saved version."),
    ).toBeInTheDocument();
  });

  it("a baseline that did not resolve: no switch, both downloads refused with the reason, the note", () => {
    render(
      <View
        copy={{
          changes: {
            baseline: null,
            onExportPdf: vi.fn(),
            onExportMarkdown: vi.fn(),
            exportingPdf: false,
            exportingMarkdown: false,
            disabledReason:
              "Could not check the original master CV to compare against. Try reloading the page.",
          },
        }}
      />,
    );

    const changes = screen.getByRole("region", { name: "Changes" });
    expect(within(changes).queryByRole("switch")).toBeNull();
    for (const name of [
      "Download changes as PDF",
      "Download changes as Markdown",
    ]) {
      const button = within(changes).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAccessibleDescription(
        "Could not check the original master CV to compare against. Try reloading the page.",
      );
    }
    expect(
      within(changes).getByText("Downloads reflect the last saved version."),
    ).toBeInTheDocument();
  });

  it("no baseline at all: no Changes card", () => {
    render(<View copy={{ changes: null }} />);
    expect(screen.queryByRole("region", { name: "Changes" })).toBeNull();
  });

  it("a closed application's copy: one status with today's words, no Save, no Delete copy, every download kept", () => {
    const { rerender } = render(
      <View readOnlyReason="finalized" copy={{ jobDescription: "" }} />,
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(
      "This application is closed.Reopen it to edit this CV.",
    );
    expect(banner).toHaveAttribute("data-reason", "finalized");
    expect(screen.queryByRole("button", { name: "Save CV copy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete copy" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add a job description" }),
    ).toBeNull();
    for (const name of [
      "Download PDF",
      "Download Markdown",
      "Download changes as PDF",
      "Download changes as Markdown",
    ]) {
      expect(screen.getByRole("button", { name }), name).not.toHaveAttribute(
        "aria-disabled",
      );
    }
    expect(root()).toHaveClass("ph-ce-nobar");
    expect(document.querySelector("form")).toHaveAttribute("data-read-only");

    rerender(<View readOnlyReason="archived" copy={{}} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "This application is in a closed cycleApplications from a past cycle are archived. You can read this CV copy, but it can no longer be edited or deleted.",
    );
    expect(screen.queryByRole("button", { name: "Save CV copy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete copy" })).toBeNull();
  });

  it("a read-only copy's fields are locked and its submit sends nothing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<View readOnlyReason="finalized" copy={{ onSubmit }} />);

    await user.click(
      screen.getByRole("button", { name: "Identity and contact" }),
    );
    expect(screen.getByLabelText("Full name")).toBeDisabled();
    document.querySelector("form")!.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("the source CV deleted: source CV deleted and today's hint", () => {
    render(<View copy={{ sourceDeleted: true, sourceCvName: null }} />);

    const source = document.querySelector('[data-slot="cv-copy-source"]')!;
    expect(source).toHaveAttribute("data-deleted");
    expect(source).toHaveTextContent("source CV deleted");
    expect(source).toHaveTextContent(
      "The master CV this copy came from has been deleted. Everything below still belongs to this application and stays editable.",
    );
    expect(screen.queryByText(/Copied from/)).toBeNull();
  });

  it("names the master CV generically when its name is not known", () => {
    render(<View copy={{ sourceCvName: null }} />);
    expect(screen.getByText("Copied from a master CV")).toBeInTheDocument();
  });

  it("no job description: today's words and Add a job description on an editable copy, no fit", async () => {
    const user = userEvent.setup();
    const onAddJobDescription = vi.fn();
    render(
      <View copy={{ jobDescription: "  ", onAddJobDescription, fit: null }} />,
    );

    const card = screen.getByRole("region", { name: "Job description" });
    expect(card).toHaveTextContent(
      "No job description saved for this application.",
    );
    const add = within(card).getByRole("button", {
      name: "Add a job description",
    });
    expect(add).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(add);
    expect(onAddJobDescription).toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "CV fit for this job" }),
    ).toBeNull();
  });

  it("the job description shows four lines, then Show more / Show less when it holds more", async () => {
    const user = userEvent.setup();
    const height = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(200);
    const client = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(87);
    try {
      render(<View copy={{}} />);

      const text = screen.getByText(
        "Northwind builds logistics software on PostgreSQL.",
      );
      expect(text).toHaveClass("ph-acv-jd-text", "ph-acv-clamp");
      const more = screen.getByRole("button", { name: "Show more" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      expect(more).toHaveAttribute("aria-controls", text.id);

      await user.click(more);
      expect(text).not.toHaveClass("ph-acv-clamp");
      const less = screen.getByRole("button", { name: "Show less" });
      expect(less).toHaveAttribute("aria-expanded", "true");
      await user.click(less);
      expect(text).toHaveClass("ph-acv-clamp");
    } finally {
      height.mockRestore();
      client.mockRestore();
    }
  });

  it("a job description within four lines has no Show more", () => {
    render(<View copy={{}} />);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("the fit loading, failing (Try again), unscored, and dirty", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const fit = (over: object) => ({
      data: undefined,
      loading: false,
      error: false,
      onRetry,
      retrying: false,
      dirty: false,
      ...over,
    });
    const { rerender } = render(
      <View copy={{ fit: fit({ loading: true }) }} />,
    );
    const loading = screen.getByRole("region", { name: "CV fit for this job" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent("Loading the fit for this job");
    // The read-only banner is the screen's one status.
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<View copy={{ fit: fit({ error: true }) }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the fit for this job.Try again",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();

    rerender(
      <View
        copy={{
          fit: fit({
            data: { score: null, matched_keywords: [], missing_keywords: [] },
          }),
        }}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "CV fit for this job" }),
    ).toBeNull();

    rerender(
      <View
        copy={{
          fit: fit({
            data: { score: 40, matched_keywords: [], missing_keywords: [] },
            dirty: true,
          }),
        }}
      />,
    );
    expect(
      screen.getByText("None of this job's keywords are in this CV."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This CV covers every keyword."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The fit reflects the last saved version."),
    ).toBeInTheDocument();
  });

  it("Save CV copy submits the page's handler; while saving it is busy and ignores another submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const { rerender } = render(<View copy={{ onSubmit }} />);

    await user.click(screen.getByRole("button", { name: "Save CV copy" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<View copy={{ onSubmit, saving: true }} />);
    const save = screen.getByRole("button", { name: "Save CV copy" });
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(save).toHaveAttribute("aria-disabled", "true");
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Download PDF and Markdown call the page; pending is said in the one live region", async () => {
    const user = userEvent.setup();
    const onExportPdf = vi.fn();
    const onExportMarkdown = vi.fn();
    const { rerender } = render(
      <View copy={{ onExportPdf, onExportMarkdown }} />,
    );

    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    await user.click(screen.getByRole("button", { name: "Download Markdown" }));
    expect(onExportPdf).toHaveBeenCalledTimes(1);
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);

    rerender(<View copy={{ onExportPdf, exportingMarkdown: true }} />);
    expect(
      screen.getByRole("button", { name: "Download Markdown" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Preparing your Markdown file.",
    );
  });

  it("Delete copy: the sheet, Delete calls the page, Cancel gives focus back", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<View copy={{ onDelete }} />);

    await user.click(screen.getByRole("button", { name: "Delete copy" }));
    const sheet = screen.getByRole("alertdialog", {
      name: "Delete this CV copy?",
    });
    expect(sheet).toHaveTextContent(
      "The copy and every edit you made to it are removed for good.",
    );
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    // The caller closes it: the sheet waits for the copy to go.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Delete copy" }),
      ),
    );
  });

  it("Delete copy while deleting stays open as Deleting..., then the picker comes back with focus on the h1", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<View copy={{}} />);
    await user.click(screen.getByRole("button", { name: "Delete copy" }));

    rerender(<View copy={{ deleting: true }} />);
    expect(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Deleting...",
      }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: "Save CV copy", hidden: true }),
    ).toHaveAttribute("aria-disabled", "true");

    // The copy is gone: the page shows the picker again.
    rerender(<View copy={null} />);
    expect(root()).toHaveAttribute("data-state", "picker");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 1, name: "Application CV" }),
      ),
    );
  });
});

describe("ApplicationCvScreenView: pending and locks", () => {
  it("Create stays refused while the chosen master CV is being deleted", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots({ selectedId: "7", deletingId: "7" });
    render(<View picker={picker} />);

    const create = screen.getByRole("button", { name: "Create the CV copy" });
    expect(create).toHaveAttribute("aria-disabled", "true");
    await user.click(create);
    expect(picker.onCreate).not.toHaveBeenCalled();
  });

  it("while creating, Tailor by keywords keeps focus and ignores taps", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots({ selectedId: "7", creating: true });
    render(<View picker={picker} />);

    const tailor = screen.getByRole("switch", { name: "Tailor by keywords" });
    expect(tailor).toHaveAttribute("aria-disabled", "true");
    expect(tailor).not.toBeDisabled();
    await user.click(tailor);
    expect(picker.onTailorByKeywordsChange).not.toHaveBeenCalled();
  });

  it("a master CV's Delete sheet ignores Escape while the page deletes it", async () => {
    const user = userEvent.setup();
    const picker = pickerSlots();
    const { rerender } = render(<View picker={picker} />);
    await user.click(
      screen.getByRole("button", { name: "Delete Backend 2026" }),
    );

    rerender(<View picker={{ ...picker, deletingId: "7" }} />);
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("alertdialog", { name: "Delete this master CV?" }),
    ).toBeInTheDocument();
  });

  it("Delete copy's sheet ignores Escape while the copy is deleting", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<View copy={{}} />);
    await user.click(screen.getByRole("button", { name: "Delete copy" }));

    rerender(<View copy={{ deleting: true }} />);
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("alertdialog", { name: "Delete this CV copy?" }),
    ).toBeInTheDocument();
  });

  it("Delete copy is refused while the copy is saving", async () => {
    const user = userEvent.setup();
    render(<View copy={{ saving: true }} />);

    const remove = screen.getByRole("button", { name: "Delete copy" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    await user.click(remove);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a deleted copy's sheet does not come back with the next copy", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<View copy={{}} />);
    await user.click(screen.getByRole("button", { name: "Delete copy" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Deleted elsewhere: the picker, then a new copy.
    rerender(<View copy={null} />);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    rerender(<View copy={{}} />);

    expect(root()).toHaveAttribute("data-state", "editor");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a diff download in flight is busy and said in the one live region", () => {
    render(
      <View
        copy={{
          changes: {
            ...editorSlots({} as never, {}).changes!,
            exportingPdf: true,
          },
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Download changes as PDF" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Preparing your download. This can take a few seconds.",
    );
  });

  it("the fit's Try again gives focus to the card once the fit loads", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const failing = {
      data: undefined,
      loading: false,
      error: true,
      onRetry,
      retrying: false,
      dirty: false,
    };
    const { rerender } = render(<View copy={{ fit: failing }} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();

    rerender(
      <View
        copy={{
          fit: {
            ...failing,
            error: false,
            data: {
              score: 50,
              matched_keywords: ["Python"],
              missing_keywords: [],
            },
          },
        }}
      />,
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("region", { name: "CV fit for this job" }),
      ),
    );
  });
});

// The page below md: today's hooks, queries and mutations behind the board.

const APPLICATION: Application = {
  id: "42",
  company_id: "c-1",
  company_name: "Northwind Labs",
  platform_id: "p-1",
  role: "Senior Backend Engineer",
  mode: "active",
  application_date: "2026-10-20",
  job_description: "Northwind needs PostgreSQL every day.",
  finalized: false,
  finalized_at: null,
};

/** Backend 2026's content, item ids kept: no change against its master CV. */
const COPY: TailoredCv = {
  ...BACKEND,
  id: "9001",
  application_id: "42",
  base_cv_id: "7",
  base_snapshot: null,
  was_ai_generated: false,
  adjustments: [
    {
      section: "skills",
      description: "Keywords reordered by job match in 1 category",
    },
  ],
};

const FIT = {
  score: 72,
  matched_keywords: ["postgresql"],
  missing_keywords: ["kafka"],
};

const NO_FILE = { blob: new Blob(["x"]), filename: null };

/** The API's answer for an application with no copy yet. */
function noCopy() {
  return {
    isAxiosError: true,
    response: { status: 404, data: { detail: "CV copy not found" } },
  };
}

/** A promise the test settles itself: the request stays in flight until then. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An axios failure as the API sends it; `blob` for the download routes. */
function apiFailure(status: number, detail: string, blob = false) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: blob ? new Blob([JSON.stringify({ detail })]) : { detail },
    },
  };
}

const CVS: MyFeature[] = [{ key: "cvs", stage: "beta" }];
const CVS_AND_JOBS: MyFeature[] = [...CVS, { key: "jobs", stage: "beta" }];

function renderCopyPage(
  features: MyFeature[] = CVS,
  options: { extra?: React.ReactNode } = {},
) {
  mocks.features.current = features;
  return renderPhoneScreen("/applications/cv", <ApplicationCvPage />, {
    features,
    extra: options.extra,
  });
}

/** The one CV request the page may never send without `cvs`. */
function cvRequests() {
  return [
    mocks.getCopy,
    mocks.listBaseCvs,
    mocks.getFit,
    mocks.createCopy,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
}

describe("the application CV page below md", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.current = "/applications/cv";
    setLocation("/applications/cv?id=42");
    mocks.getApplications.mockResolvedValue([APPLICATION]);
    mocks.getCopy.mockRejectedValue(noCopy());
    mocks.listBaseCvs.mockResolvedValue([BACKEND, FULLSTACK]);
    mocks.createCopy.mockResolvedValue(COPY);
    mocks.updateCopy.mockResolvedValue(COPY);
    mocks.removeCopy.mockResolvedValue(undefined);
    mocks.getFit.mockResolvedValue(FIT);
    mocks.exportCopyPdf.mockResolvedValue(NO_FILE);
    mocks.exportCopyMarkdown.mockResolvedValue(NO_FILE);
    mocks.exportDiffPdf.mockResolvedValue(NO_FILE);
    mocks.exportDiffMarkdown.mockResolvedValue(NO_FILE);
    mocks.exportBaseCvPdf.mockResolvedValue(NO_FILE);
    mocks.exportBaseCvMarkdown.mockResolvedValue(NO_FILE);
    URL.createObjectURL = (() =>
      "blob:applika/cv") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = () => {};
  });

  it("renders the picker inside the shell: back Application to the application's row, Beta in the bar, role · company", async () => {
    await renderCopyPage();

    await waitFor(() => expect(root()).toHaveAttribute("data-state", "picker"));
    const bar = document.querySelector<HTMLElement>(
      '[data-slot="phone-top-bar"]',
    )!;
    const back = within(bar).getByRole("link", { name: "Application" });
    expect(back).toHaveAttribute("href", "/applications?focus=42");
    expect(within(bar).getAllByRole("link")).toHaveLength(1);
    expect(
      (await within(bar).findByText("Beta")).closest(
        '[data-slot="phone-pill"]',
      ),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Application CV" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Senior Backend Engineer · Northwind Labs"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("group", { name: "Choose a master CV" }),
    ).toBeInTheDocument();
    // The shell adds no padding around a board.
    expect(
      document.querySelector('[data-slot="app-content"]')!.className,
    ).not.toMatch(/(^|\s)(px|pt|pb|py)-/);
    // Today's desktop picker is not mounted.
    expect(document.querySelector('[data-slot="base-cv-picker"]')).toBeNull();
  });

  it("creates a plain copy of the chosen CV: no jobs, no Tailor and no fit request", async () => {
    const user = userEvent.setup();
    await renderCopyPage(CVS);

    const group = await screen.findByRole("group", {
      name: "Choose a master CV",
    });
    expect(screen.queryByRole("switch")).toBeNull();
    await user.click(within(group).getByText("Full-stack"));
    expect(
      within(group).getByRole("radio", { name: "Full-stack" }),
    ).toBeChecked();
    mocks.getCopy.mockResolvedValue(COPY);
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );

    await waitFor(() =>
      expect(mocks.createCopy).toHaveBeenCalledWith("42", "8", "copy"),
    );
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    expect(mocks.getFit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "CV fit for this job" }),
    ).toBeNull();
  });

  it("with jobs and a job description: Tailor by keywords sends keywords, and the copy shows its fit", async () => {
    const user = userEvent.setup();
    await renderCopyPage(CVS_AND_JOBS);

    const group = await screen.findByRole("group", {
      name: "Choose a master CV",
    });
    await user.click(within(group).getByText("Backend 2026"));
    const tailor = screen.getByRole("switch", { name: "Tailor by keywords" });
    expect(tailor).toHaveAttribute("aria-checked", "false");
    await user.click(tailor);
    expect(tailor).toHaveAttribute("aria-checked", "true");
    mocks.getCopy.mockResolvedValue(COPY);
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );

    await waitFor(() =>
      expect(mocks.createCopy).toHaveBeenCalledWith("42", "7", "keywords"),
    );
    const fit = await screen.findByRole("region", {
      name: "CV fit for this job",
    });
    await waitFor(() => expect(fit).toHaveAttribute("data-state", "ready"));
    expect(within(fit).getByText("Fit 72%")).toBeInTheDocument();
    expect(mocks.getFit).toHaveBeenCalledWith("42");
  });

  it("with jobs but a blank job description: no Tailor, no fit request, and the copy offers today's way to add one", async () => {
    const user = userEvent.setup();
    mocks.getApplications.mockResolvedValue([
      { ...APPLICATION, job_description: "   " },
    ]);
    await renderCopyPage(CVS_AND_JOBS);

    await screen.findByRole("group", { name: "Choose a master CV" });
    expect(screen.queryByRole("switch")).toBeNull();

    mocks.getCopy.mockResolvedValue(COPY);
    await user.click(screen.getByText("Backend 2026"));
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    expect(mocks.createCopy).toHaveBeenCalledWith("42", "7", "copy");
    expect(mocks.getFit).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Add a job description" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit Application" }),
    ).toHaveTextContent("Northwind Labs");
  });

  it("opens an existing copy: source, the Changes card against the master CV, the rows, and Save sends the form", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage(CVS_AND_JOBS);

    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    expect(
      await screen.findByText("Copied from Backend 2026"),
    ).toBeInTheDocument();
    const changes = await screen.findByRole("region", { name: "Changes" });
    const toggle = within(changes).getByRole("switch", {
      name: "Show changes",
    });
    expect(toggle).toHaveAccessibleDescription(
      "Compared with Backend 2026: no changes",
    );
    await user.click(toggle);
    expect(
      within(changes).getByRole("list", { name: "Reordered by job match" }),
    ).toHaveTextContent("Skills");
    // The row says it once, Show changes on or off.
    expect(
      screen.getByRole("button", { name: "Skills" }),
    ).toHaveAccessibleDescription("1 group · 3 keywords · Reordered");

    await user.click(screen.getByRole("button", { name: "Save CV copy" }));
    await waitFor(() => expect(mocks.updateCopy).toHaveBeenCalledTimes(1));
    expect(mocks.updateCopy.mock.calls[0][0]).toBe("42");
    expect(mocks.updateCopy.mock.calls[0][1]).toMatchObject({
      name: "Backend 2026",
      full_name: "Sam Carter",
    });
  });

  it("a closed application: the banner, no Save and no Delete copy, the downloads still download", async () => {
    const user = userEvent.setup();
    mocks.getApplications.mockResolvedValue([
      { ...APPLICATION, finalized: true, finalized_at: "2026-10-25T10:00:00Z" },
    ]);
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage(CVS_AND_JOBS);

    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "This application is closed.Reopen it to edit this CV.",
    );
    expect(screen.queryByRole("button", { name: "Save CV copy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete copy" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(mocks.exportCopyPdf).toHaveBeenCalledWith("42"));
    await user.click(screen.getByRole("button", { name: "Download Markdown" }));
    await waitFor(() =>
      expect(mocks.exportCopyMarkdown).toHaveBeenCalledWith("42"),
    );
  });

  it("an archived cycle's copy reads only, in today's words", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage(CVS, { extra: <PickPastCycle /> });
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));

    await user.click(screen.getByRole("button", { name: "pick past cycle" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "This application is in a closed cycle",
      ),
    );
    expect(mocks.getApplications).toHaveBeenCalledWith("c2");
    expect(screen.queryByRole("button", { name: "Save CV copy" })).toBeNull();
  });

  it("Delete copy goes back to the picker with every master CV offered", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage();
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));

    await user.click(screen.getByRole("button", { name: "Delete copy" }));
    mocks.getCopy.mockRejectedValue(noCopy());
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => expect(mocks.removeCopy).toHaveBeenCalledWith("42"));
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "picker"));
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("no ?id=: today's message in the phone layout, and no request for an application", async () => {
    setLocation("/applications/cv");
    await renderCopyPage();

    await waitFor(() => expect(root()).toHaveAttribute("data-state", "no-id"));
    expect(screen.getByText("No application selected")).toBeInTheDocument();
    expect(mocks.getApplications).not.toHaveBeenCalled();
  });

  it("an id the viewed cycle does not hold: today's message as an alert", async () => {
    setLocation("/applications/cv?id=404");
    await renderCopyPage();

    await waitFor(() =>
      expect(root()).toHaveAttribute("data-state", "open-error"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "It is not in the cycle you are viewing.",
    );
    // The back link still names the application it came from.
    expect(
      within(
        document.querySelector<HTMLElement>('[data-slot="phone-top-bar"]')!,
      ).getByRole("link", { name: "Application" }),
    ).toHaveAttribute("href", "/applications?focus=404");
  });

  it("without cvs: page not found and no CV request", async () => {
    await renderCopyPage([{ key: "jobs", stage: "beta" }]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(root()).toBeNull();
    expect(cvRequests()).toBe(0);
  });

  it("crossing md with Delete copy's sheet open: the sheet closes and today's editor takes over", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue(COPY);
    mocks.features.current = CVS;
    const { viewport } = renderShellAcrossMd(
      "/applications/cv",
      <ApplicationCvPage />,
      { features: CVS },
    );
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    await user.click(screen.getByRole("button", { name: "Delete copy" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    viewport.setPhone(false);

    expect(root()).toBeNull();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      await screen.findByRole("heading", { level: 1, name: "Application CV" }),
    ).toBeInTheDocument();
    expect(mocks.removeCopy).not.toHaveBeenCalled();
  });

  it("crossing md with the job description sheet open: it closes, a half-filled form in it is lost", async () => {
    const user = userEvent.setup();
    mocks.getApplications.mockResolvedValue([
      { ...APPLICATION, job_description: null },
    ]);
    mocks.getCopy.mockResolvedValue(COPY);
    mocks.features.current = CVS;
    const { viewport } = renderShellAcrossMd(
      "/applications/cv",
      <ApplicationCvPage />,
      { features: CVS },
    );
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    await user.click(
      screen.getByRole("button", { name: "Add a job description" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit Application" }),
    ).toBeInTheDocument();

    viewport.setPhone(false);

    expect(root()).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Application CV" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Edit Application" }),
    ).toBeNull();
  });

  it("crossing md with a master CV's Delete sheet open: the sheet closes and nothing is deleted", async () => {
    const user = userEvent.setup();
    mocks.features.current = CVS;
    const { viewport } = renderShellAcrossMd(
      "/applications/cv",
      <ApplicationCvPage />,
      { features: CVS },
    );
    await user.click(
      await screen.findByRole("button", { name: "Delete Backend 2026" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Delete this master CV?" }),
    ).toBeInTheDocument();

    viewport.setPhone(false);

    expect(root()).toBeNull();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      await screen.findByRole("heading", { level: 1, name: "Application CV" }),
    ).toBeInTheDocument();
    expect(mocks.removeBaseCv).not.toHaveBeenCalled();
  });

  it("the source CV deleted: source CV deleted, and Show changes against the saved snapshot", async () => {
    mocks.getCopy.mockResolvedValue({
      ...COPY,
      base_cv_id: null,
      base_snapshot: { ...BACKEND, headline: "Backend Engineer" },
    });
    await renderCopyPage();

    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    expect(screen.getByText("source CV deleted")).toBeInTheDocument();
    expect(screen.queryByText(/^Copied from/)).toBeNull();
    const changes = await screen.findByRole("region", { name: "Changes" });
    expect(
      within(changes).getByRole("switch", { name: "Show changes" }),
    ).toHaveAccessibleDescription(
      "Compared with the original master CV: 1 change",
    );
  });

  it("the source CV deleted with no saved snapshot: no Changes card, as today", async () => {
    mocks.getCopy.mockResolvedValue({
      ...COPY,
      base_cv_id: null,
      base_snapshot: null,
    });
    await renderCopyPage();

    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
    expect(screen.getByText("source CV deleted")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Changes" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Show changes" })).toBeNull();
  });

  it("a choice's PDF and Markdown reach today's master CV exports, busy while they run", async () => {
    const user = userEvent.setup();
    const pdf = deferred<typeof NO_FILE>();
    const markdown = deferred<typeof NO_FILE>();
    mocks.exportBaseCvPdf.mockReturnValue(pdf.promise);
    mocks.exportBaseCvMarkdown.mockReturnValue(markdown.promise);
    await renderCopyPage();

    const pdfButton = await screen.findByRole("button", {
      name: "Download PDF of Backend 2026",
    });
    await user.click(pdfButton);
    await waitFor(() =>
      expect(mocks.exportBaseCvPdf).toHaveBeenCalledWith("7"),
    );
    expect(mocks.exportBaseCvMarkdown).not.toHaveBeenCalled();
    await waitFor(() => expect(pdfButton).toHaveAttribute("aria-busy", "true"));
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Preparing your PDF. This can take a few seconds.",
    );
    pdf.resolve(NO_FILE);
    await waitFor(() => expect(pdfButton).not.toHaveAttribute("aria-busy"));

    const markdownButton = screen.getByRole("button", {
      name: "Download Markdown of Full-stack",
    });
    await user.click(markdownButton);
    await waitFor(() =>
      expect(mocks.exportBaseCvMarkdown).toHaveBeenCalledWith("8"),
    );
    expect(mocks.exportBaseCvPdf).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(markdownButton).toHaveAttribute("aria-busy", "true"),
    );
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Preparing your Markdown file.",
    );
    // A second tap while it runs sends nothing.
    await user.click(markdownButton);
    expect(mocks.exportBaseCvMarkdown).toHaveBeenCalledTimes(1);
    markdown.resolve(NO_FILE);
    await waitFor(() =>
      expect(markdownButton).not.toHaveAttribute("aria-busy"),
    );
  });

  it("a choice's Delete reaches today's master CV delete; the sheet closes once the list drops it", async () => {
    const user = userEvent.setup();
    const removal = deferred<undefined>();
    mocks.removeBaseCv.mockReturnValue(removal.promise);
    await renderCopyPage();

    await user.click(
      await screen.findByRole("button", { name: "Delete Backend 2026" }),
    );
    mocks.listBaseCvs.mockResolvedValue([FULLSTACK]);
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => expect(mocks.removeBaseCv).toHaveBeenCalledWith("7"));
    expect(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Deleting...",
      }),
    ).toHaveAttribute("aria-busy", "true");
    removal.resolve(undefined);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByRole("radio", { name: "Backend 2026" })).toBeNull();
    expect(
      screen.getByRole("radio", { name: "Full-stack" }),
    ).toBeInTheDocument();
  });

  it("Create the CV copy sends one request: busy and refused while it runs", async () => {
    const user = userEvent.setup();
    const creation = deferred<TailoredCv>();
    mocks.createCopy.mockReturnValue(creation.promise);
    await renderCopyPage();

    await user.click(await screen.findByText("Backend 2026"));
    const create = screen.getByRole("button", { name: "Create the CV copy" });
    await user.click(create);
    await waitFor(() => expect(create).toHaveAttribute("aria-busy", "true"));
    await user.click(create);
    expect(mocks.createCopy).toHaveBeenCalledTimes(1);

    mocks.getCopy.mockResolvedValue(COPY);
    creation.resolve(COPY);
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "editor"));
  });

  it("Save CV copy sends one request: busy and refused while it runs", async () => {
    const user = userEvent.setup();
    const saving = deferred<TailoredCv>();
    mocks.updateCopy.mockReturnValue(saving.promise);
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage();

    const save = await screen.findByRole("button", { name: "Save CV copy" });
    await user.click(save);
    await waitFor(() => expect(save).toHaveAttribute("aria-busy", "true"));
    await user.click(save);
    expect(mocks.updateCopy).toHaveBeenCalledTimes(1);
    // Saving locks Delete copy too.
    expect(screen.getByRole("button", { name: "Delete copy" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    saving.resolve(COPY);
    await waitFor(() => expect(save).not.toHaveAttribute("aria-busy"));
  });

  it("Delete copy's sheet says Deleting... while the request runs", async () => {
    const user = userEvent.setup();
    const removal = deferred<undefined>();
    mocks.removeCopy.mockReturnValue(removal.promise);
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage();

    await user.click(
      await screen.findByRole("button", { name: "Delete copy" }),
    );
    mocks.getCopy.mockRejectedValue(noCopy());
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    const pending = await within(screen.getByRole("alertdialog")).findByRole(
      "button",
      { name: "Deleting..." },
    );
    expect(pending).toHaveAttribute("aria-busy", "true");
    removal.resolve(undefined);
    await waitFor(() => expect(root()).toHaveAttribute("data-state", "picker"));
  });

  it("the copy's PDF and Markdown reach today's exports, busy while they run", async () => {
    const user = userEvent.setup();
    const pdf = deferred<typeof NO_FILE>();
    const markdown = deferred<typeof NO_FILE>();
    mocks.exportCopyPdf.mockReturnValue(pdf.promise);
    mocks.exportCopyMarkdown.mockReturnValue(markdown.promise);
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage();

    const pdfButton = await screen.findByRole("button", {
      name: "Download PDF",
    });
    await user.click(pdfButton);
    await waitFor(() => expect(pdfButton).toHaveAttribute("aria-busy", "true"));
    expect(mocks.exportCopyPdf).toHaveBeenCalledWith("42");
    expect(mocks.exportCopyMarkdown).not.toHaveBeenCalled();
    pdf.resolve(NO_FILE);
    await waitFor(() => expect(pdfButton).not.toHaveAttribute("aria-busy"));

    const markdownButton = screen.getByRole("button", {
      name: "Download Markdown",
    });
    await user.click(markdownButton);
    await waitFor(() =>
      expect(markdownButton).toHaveAttribute("aria-busy", "true"),
    );
    expect(mocks.exportCopyMarkdown).toHaveBeenCalledWith("42");
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Preparing your Markdown file.",
    );
    markdown.resolve(NO_FILE);
    await waitFor(() =>
      expect(markdownButton).not.toHaveAttribute("aria-busy"),
    );
  });

  it("Download changes as PDF and as Markdown reach today's diff exports, busy while they run", async () => {
    const user = userEvent.setup();
    const pdf = deferred<typeof NO_FILE>();
    const markdown = deferred<typeof NO_FILE>();
    mocks.exportDiffPdf.mockReturnValue(pdf.promise);
    mocks.exportDiffMarkdown.mockReturnValue(markdown.promise);
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage();

    const changes = await screen.findByRole("region", { name: "Changes" });
    const pdfButton = within(changes).getByRole("button", {
      name: "Download changes as PDF",
    });
    await user.click(pdfButton);
    await waitFor(() => expect(pdfButton).toHaveAttribute("aria-busy", "true"));
    expect(mocks.exportDiffPdf).toHaveBeenCalledWith("42");
    expect(mocks.exportDiffMarkdown).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Preparing your download. This can take a few seconds.",
    );
    pdf.resolve(NO_FILE);
    await waitFor(() => expect(pdfButton).not.toHaveAttribute("aria-busy"));

    const markdownButton = within(changes).getByRole("button", {
      name: "Download changes as Markdown",
    });
    await user.click(markdownButton);
    await waitFor(() =>
      expect(markdownButton).toHaveAttribute("aria-busy", "true"),
    );
    expect(mocks.exportDiffMarkdown).toHaveBeenCalledWith("42");
    expect(mocks.exportDiffPdf).toHaveBeenCalledTimes(1);
    // While one runs, neither download sends a second request.
    await user.click(markdownButton);
    await user.click(pdfButton);
    expect(mocks.exportDiffMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.exportDiffPdf).toHaveBeenCalledTimes(1);
    markdown.resolve(NO_FILE);
    await waitFor(() =>
      expect(markdownButton).not.toHaveAttribute("aria-busy"),
    );
  });

  it("a 409 on Download changes refuses both downloads with the server's reason", async () => {
    const user = userEvent.setup();
    mocks.exportDiffPdf.mockRejectedValueOnce(
      apiFailure(409, "This CV copy has no baseline to compare with.", true),
    );
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage();

    const changes = await screen.findByRole("region", { name: "Changes" });
    await user.click(
      within(changes).getByRole("button", { name: "Download changes as PDF" }),
    );

    for (const name of [
      "Download changes as PDF",
      "Download changes as Markdown",
    ]) {
      const button = within(changes).getByRole("button", { name });
      await waitFor(() =>
        expect(button).toHaveAttribute("aria-disabled", "true"),
      );
      expect(button).toHaveAccessibleDescription(
        "This CV copy has no baseline to compare with.",
      );
    }
    await user.click(
      within(changes).getByRole("button", {
        name: "Download changes as Markdown",
      }),
    );
    expect(mocks.exportDiffMarkdown).not.toHaveBeenCalled();
  });

  it("the master CVs failing to load under a copy with no snapshot: Download changes refused with today's reason", async () => {
    mocks.listBaseCvs.mockRejectedValue(apiFailure(500, "boom"));
    mocks.getCopy.mockResolvedValue({ ...COPY, base_snapshot: null });
    await renderCopyPage();

    const changes = await screen.findByRole("region", { name: "Changes" });
    expect(within(changes).queryByRole("switch")).toBeNull();
    for (const name of [
      "Download changes as PDF",
      "Download changes as Markdown",
    ]) {
      const button = within(changes).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAccessibleDescription(
        "Could not check the original master CV to compare against. Try reloading the page.",
      );
    }
  });

  it("a copy that differs from its master CV: Show changes on gives the row its count and today's markers", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue({
      ...COPY,
      headline: "Staff Backend Engineer",
    });
    await renderCopyPage();

    const changes = await screen.findByRole("region", { name: "Changes" });
    const toggle = within(changes).getByRole("switch", {
      name: "Show changes",
    });
    expect(toggle).toHaveAccessibleDescription(
      "Compared with Backend 2026: 1 change",
    );
    const identity = screen.getByRole("button", {
      name: "Identity and contact",
    });
    expect(identity).toHaveAccessibleDescription(
      "Sam Carter · Staff Backend Engineer",
    );

    await user.click(toggle);
    expect(identity).toHaveAccessibleDescription(
      "Sam Carter · Staff Backend Engineer 1 change",
    );
    await user.click(identity);
    expect(
      row("identity").querySelector('[data-slot="cv-diff-changed"]'),
    ).not.toBeNull();
    expect(
      within(row("identity")).getByRole("button", {
        name: "Changed: Headline",
      }),
    ).toBeInTheDocument();
  });

  it("a copy that fails to load (not a 404): today's alert, not an endless skeleton", async () => {
    mocks.getCopy.mockRejectedValue(apiFailure(500, "boom"));
    await renderCopyPage();

    await waitFor(() =>
      expect(root()).toHaveAttribute("data-state", "copy-error"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load this CV copyboom",
    );
  });

  it("an application that fails to load: the server's words in today's alert", async () => {
    mocks.getApplications.mockRejectedValue(apiFailure(500, "Server down"));
    await renderCopyPage();

    await waitFor(() =>
      expect(root()).toHaveAttribute("data-state", "open-error"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not open this applicationServer down",
    );
  });

  it("the fit's Try again asks for the fit again", async () => {
    const user = userEvent.setup();
    mocks.getFit.mockRejectedValueOnce(apiFailure(500, "boom"));
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage(CVS_AND_JOBS);

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mocks.getFit).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "CV fit for this job" }),
      ).toHaveAttribute("data-state", "ready"),
    );
  });

  it("says the fit reflects the last saved version while the copy holds unsaved edits", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage(CVS_AND_JOBS);

    const fit = await screen.findByRole("region", {
      name: "CV fit for this job",
    });
    await waitFor(() => expect(fit).toHaveAttribute("data-state", "ready"));
    expect(
      within(fit).queryByText("The fit reflects the last saved version."),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Identity and contact" }),
    );
    await user.type(screen.getByLabelText("Headline"), " and more");

    expect(
      within(fit).getByText("The fit reflects the last saved version."),
    ).toBeInTheDocument();
  });

  it("an invalid save opens the failing row and tells it in today's toast, sending nothing", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPage();

    const skills = await screen.findByRole("button", { name: "Skills" });
    await user.click(skills);
    await user.clear(within(row("skills")).getByLabelText("Category"));
    await user.click(skills);
    expect(skills).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Save CV copy" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Every skill category needs a name. Remove the categories you do not want.",
      ),
    );
    expect(skills).toHaveAttribute("aria-expanded", "true");
    expect(skills).toHaveAccessibleDescription("Needs a fix");
    expect(mocks.updateCopy).not.toHaveBeenCalled();
  });
});
