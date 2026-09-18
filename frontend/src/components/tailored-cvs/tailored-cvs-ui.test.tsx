import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { ExportCvButton } from "@/components/base-cvs/export-cv-button";
import {
  CV_PDF_EXPORT_LABEL,
  type CvFormValues,
} from "@/components/base-cvs/types";
import { BaseCvPicker } from "./base-cv-picker";
import { TailoredCvEditor } from "./tailored-cv-editor";
import {
  emptyTailoredCvValues,
  tailoredCvSchema,
  toTailoredCvPayload,
} from "./tailored-cv-schema";
import type { BaseCvOption } from "./types";

const OPTIONS: BaseCvOption[] = [
  {
    id: "1",
    name: "Backend CV",
    full_name: "Ada",
    headline: "Eng",
    skills: [
      { id: "s-1", category: "Languages and frameworks", keywords: ["Python"] },
    ],
    updated_at: null,
  },
  {
    id: "2",
    name: "Frontend CV",
    full_name: "Ada",
    headline: "Eng",
    skills: [],
    updated_at: "2026-01-02T10:00:00Z",
  },
];

function Editor(props: Partial<React.ComponentProps<typeof TailoredCvEditor>>) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(tailoredCvSchema),
    defaultValues: emptyTailoredCvValues(),
  });
  return (
    <TailoredCvEditor
      form={form}
      onSubmit={form.handleSubmit(() => {})}
      baseCvId={null}
      {...props}
    />
  );
}

/**
 * The tailored-CV surface, as a VISUAL contract (KODI-003).
 *
 * It asserts the acceptance criteria that are visible: the picker preselects a
 * lone master CV (AC2) and never invents a default (AC1), a copy whose source
 * was deleted still shows its content and says so (AC4), every field is
 * editable (AC6), the copy can be deleted behind a confirm (AC7), the job
 * description sits beside the fields (AC9), and a finalized or archived
 * application locks the whole surface (AC10).
 *
 * Presentational only — no queries, no services. The page's wiring is tested
 * separately.
 */
describe("the CV copy carries the same sections as a master CV (KODI-006)", () => {
  it("edits skills as categories and carries an education section (AC3, AC4)", async () => {
    // AC4 names BOTH surfaces — "A master CV and an application's CV copy".
    // The copy gets them for free because the editor body is the master CV's
    // `CvFormSections`; this pins that it stays that way.
    const user = userEvent.setup();
    render(<Editor />);

    await user.click(screen.getByRole("button", { name: "Add category" }));
    const category = within(screen.getByRole("group", { name: "category 1" }));
    await user.type(category.getByLabelText("Category"), "Data stores");
    await user.type(
      category.getByLabelText("Add a keyword to Data stores"),
      "PostgreSQL{Enter}",
    );

    await user.click(screen.getByRole("button", { name: "Add education" }));
    const qualification = within(
      screen.getByRole("group", { name: "education 1" }),
    );
    await user.type(
      qualification.getByLabelText("Institution"),
      "University of Bath",
    );
    await user.type(qualification.getByLabelText("Degree"), "MSc");

    expect(
      category.getByRole("button", { name: "Rename PostgreSQL" }),
    ).toBeInTheDocument();
    expect(qualification.getByLabelText("Degree")).toHaveValue("MSc");
  });

  it("asks the copy for the same required start and optional finish (KODI-007)", async () => {
    // The copy's body IS `CvFormSections`, so it gets the period pair for
    // free. This pins that it stays that way — AC1 and AC2 name both surfaces.
    const user = userEvent.setup();
    render(<Editor />);

    await user.click(screen.getByRole("button", { name: "Add experience" }));
    await user.click(screen.getByRole("button", { name: "Add education" }));

    for (const name of ["experience 1", "education 1"]) {
      const row = within(screen.getByRole("group", { name }));
      expect(row.getByLabelText("Start"), name).toHaveAttribute(
        "aria-required",
        "true",
      );
      expect(row.getByLabelText("Finish"), name).not.toHaveAttribute(
        "aria-required",
      );
      expect(row.queryByLabelText("Period"), name).not.toBeInTheDocument();
    }

    await user.type(
      within(
        screen.getByRole("group", { name: "experience 1" }),
      ).getByLabelText("Start"),
      "022023",
    );
    expect(
      within(
        screen.getByRole("group", { name: "experience 1" }),
      ).getByLabelText("Start"),
    ).toHaveValue("02/2023");
  });

  it("renders its sections in the owner's order, education included", () => {
    render(<Editor />);

    // Scoped to the CV field body: the copy's own panels (the job
    // description, the provenance badge) are headings of the same level.
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
        .slice(0, 9),
    ).toEqual([
      "Identity and contact",
      "Links",
      "Summary",
      "Skills",
      "Experience",
      "Projects",
      "Education",
      "Certifications",
      "Languages",
    ]);
  });

  it("maps categories and qualifications onto the wire shape", () => {
    expect(
      toTailoredCvPayload({
        ...emptyTailoredCvValues(),
        name: "Copy",
        full_name: "Ada",
        headline: "Eng",
        location: "London",
        email: "ada@example.com",
        summary: "Summary.",
        skills: [
          { id: "s-1", category: " Data stores ", keywords: [" Redis ", " "] },
          { id: "s-2", category: "  ", keywords: [] },
        ],
        education: [
          {
            id: "d-1",
            institution: " University of Bath ",
            degree: " MSc ",
            area: "  ",
            start: " 2018-09 ",
            end: "",
          },
          {
            id: "d-2",
            institution: "",
            degree: "",
            area: "",
            start: "",
            end: "",
          },
        ],
      }),
    ).toMatchObject({
      skills: [{ id: "s-1", category: "Data stores", keywords: ["Redis"] }],
      education: [
        {
          id: "d-1",
          institution: "University of Bath",
          degree: "MSc",
          area: undefined,
          start: "2018-09",
          end: undefined,
        },
      ],
    });
  });
});

describe("the tailored CV surface", () => {
  it("picker preselects the only option", () => {
    const onValueChange = vi.fn();
    render(
      <BaseCvPicker
        options={[OPTIONS[0]]}
        onValueChange={onValueChange}
        onCreate={() => {}}
      />,
    );
    expect(onValueChange).toHaveBeenCalledWith("1");
  });

  it("picker does not preselect with two options and disables create", () => {
    const onValueChange = vi.fn();
    render(
      <BaseCvPicker
        options={OPTIONS}
        onValueChange={onValueChange}
        onCreate={() => {}}
      />,
    );
    expect(onValueChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Create the CV copy" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("picker shows the empty state with no master CVs", () => {
    render(
      <BaseCvPicker
        options={[]}
        onValueChange={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Create a master CV" }),
    ).toHaveAttribute("href", "/cvs/new");
  });

  it("picker blocks create in read-only mode", () => {
    render(
      <BaseCvPicker
        options={OPTIONS}
        onValueChange={() => {}}
        onCreate={() => {}}
        readOnlyReason="finalized"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Create the CV copy" }),
    ).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "This application is closed.",
    );
  });

  it("gives the job description ONE disclosure, the card's own header (10)", async () => {
    const user = userEvent.setup();
    render(
      <Editor
        jobDescription="We need a backend engineer."
        onDelete={() => {}}
      />,
    );

    // It used to carry a second toggle — a Hide/Show button in the header's
    // action slot — over the same body the card itself could already fold, so
    // the two could disagree about what was on screen. Removing the action
    // slot (criterion 10) left the header as the one control.
    expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull();

    const trigger = screen.getByRole("button", { name: "Job description" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: "Job description text" }),
    ).toBeVisible();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: "Job description text" }),
    ).toBeNull();
  });

  it("editor shows source CV deleted, the job description and the delete action", () => {
    render(
      <Editor
        jobDescription="We need a backend engineer."
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("source CV deleted")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Job description text" }),
    ).toHaveTextContent("We need a backend engineer.");
    expect(
      screen.getByRole("button", { name: "Delete this CV copy" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeEnabled();
  });

  it("editor hides the footer and delete in read-only mode and disables fields", () => {
    render(
      <Editor
        baseCvId="7"
        sourceCvName="Backend CV"
        onDelete={() => {}}
        readOnlyReason="archived"
      />,
    );
    expect(screen.queryByRole("button", { name: "Save CV copy" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete this CV copy" }),
    ).toBeNull();
    expect(screen.getByLabelText("Full name")).toBeDisabled();
    expect(screen.getByText("Copied from Backend CV")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("closed cycle");
  });

  it("editor keeps the export, and ONLY the export, in read-only mode (KODI-004, AC1)", () => {
    render(
      <Editor
        baseCvId="7"
        sourceCvName="Backend CV"
        onDelete={() => {}}
        readOnlyReason="finalized"
        actions={<ExportCvButton onExport={() => {}} />}
      />,
    );

    // A finalized copy cannot be written, but downloading it is exactly what it
    // is still for: the button is PRESENT and ENABLED, never merely visible.
    expect(
      screen.getByRole("button", { name: CV_PDF_EXPORT_LABEL }),
    ).toBeEnabled();
    // The lock itself is untouched by the new footer.
    expect(screen.queryByRole("button", { name: "Save CV copy" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete this CV copy" }),
    ).toBeNull();
    expect(screen.getByLabelText("Full name")).toBeDisabled();
  });

  it("editor exports a copy whose master CV is gone (KODI-004, AC1)", async () => {
    const onExport = vi.fn();
    render(
      <Editor
        baseCvId={null}
        onDelete={() => {}}
        actions={<ExportCvButton onExport={onExport} />}
      />,
    );

    expect(screen.getByText("source CV deleted")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: CV_PDF_EXPORT_LABEL });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("editor empty job description hint offers the add control", async () => {
    const onAdd = vi.fn();
    render(<Editor jobDescription={null} onAddJobDescription={onAdd} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Add a job description" }),
    );
    expect(onAdd).toHaveBeenCalled();
  });

  it("payload drops blanks", () => {
    const values = {
      ...emptyTailoredCvValues(),
      name: " CV ",
      links: [{ id: "a", label: "", url: "" }],
    };
    expect(toTailoredCvPayload(values)).toMatchObject({
      name: "CV",
      links: [],
      phone: null,
    });
  });
});
