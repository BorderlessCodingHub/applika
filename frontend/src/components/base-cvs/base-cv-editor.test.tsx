import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { BaseCvEditor } from "./base-cv-editor";
import { ExportCvButton } from "./export-cv-button";
import {
  BASE_CV_MAX,
  baseCvSchema,
  baseCvToFormValues,
  emptyBaseCvValues,
  sectionErrorMessage,
  toBaseCvPayload,
} from "./base-cv-schema";
import { BASE_CV_LIMIT_REASON, NewCvCard } from "./new-cv-card";
import {
  BASE_CVS_MAX,
  CV_PDF_EXPORT_LABEL,
  type BaseCv,
  type CvFormValues,
} from "./types";

/**
 * Master CV form and cap affordance (KODI-002 / R-001, R-002, R-003).
 *
 * Three properties hang off this file:
 *  - AC1 — the form captures the label, the identity and contact block, the
 *    summary and all seven list sections, and hands them to the caller;
 *  - AC1 — the schema requires what the editor marks as required and accepts a
 *    CV whose sections are all empty;
 *  - AC2 — at the cap the create affordance is genuinely disabled and the
 *    reason, containing the words "the limit is three", is real on-screen text.
 */

/** A persisted CV with one row in every section, for the round-trip tests. */
const SAVED_CV: BaseCv = {
  id: "7001",
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London, United Kingdom",
  email: "ada@example.com",
  phone: null,
  summary: "Backend engineer with eight years on payment systems.",
  links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
  skills: [
    {
      id: "s-1",
      category: "Languages and frameworks",
      keywords: ["Python", "PostgreSQL"],
    },
  ],
  experience: [
    {
      id: "e-1",
      company: "Stripe",
      company_description: "Payments infrastructure.",
      role: "Senior Backend Engineer",
      period: "2021 — Present",
      location: "Remote",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [
    {
      id: "p-1",
      name: "difference-engine",
      description: "A mechanical computer, in Rust.",
      link: "https://example.com/de",
      link_label: "Live demo",
    },
  ],
  education: [
    {
      id: "d-1",
      institution: "University of Edinburgh",
      degree: "BSc",
      area: "Computer Science",
      period: "2010 — 2013",
    },
  ],
  certifications: [
    { id: "c-1", name: "AWS SAA", issuer: "Amazon Web Services" },
  ],
  languages: [{ id: "g-1", name: "English", level: "Native" }],
  created_at: "2026-01-02T10:00:00Z",
  updated_at: "2026-01-03T10:00:00Z",
};

/** The scalars the schema requires, so a section-only assertion is not blocked. */
const REQUIRED_SCALARS = {
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London, United Kingdom",
  email: "ada@example.com",
  summary: "Eight years on payment systems.",
};

function validValues(over: Partial<CvFormValues> = {}): CvFormValues {
  return { ...emptyBaseCvValues(), ...REQUIRED_SCALARS, ...over };
}

function Harness({
  defaults,
  onValid,
  actions,
}: {
  defaults?: CvFormValues;
  onValid: (values: CvFormValues) => void;
  actions?: ReactNode;
}) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(baseCvSchema),
    defaultValues: defaults ?? emptyBaseCvValues(),
  });
  return (
    <BaseCvEditor
      form={form}
      onSubmit={form.handleSubmit(onValid)}
      submitLabel="Create CV"
      actions={actions}
      // Deterministic ids: the editor mints them, the payload keeps them.
      newItemId={(() => {
        let n = 0;
        return () => `new-${++n}`;
      })()}
    />
  );
}

describe("baseCvSchema", () => {
  it("accepts a CV carrying all eight sections", () => {
    // summary + links + skills + experience + projects + education +
    // certifications + languages.
    const values = baseCvToFormValues(SAVED_CV);
    const parsed = baseCvSchema.safeParse(values);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.summary).toBe(SAVED_CV.summary);
    expect(parsed.data?.links).toHaveLength(1);
    expect(parsed.data?.skills).toEqual([
      {
        id: "s-1",
        category: "Languages and frameworks",
        keywords: ["Python", "PostgreSQL"],
      },
    ]);
    expect(parsed.data?.experience).toHaveLength(1);
    expect(parsed.data?.projects).toHaveLength(1);
    expect(parsed.data?.education).toHaveLength(1);
    expect(parsed.data?.certifications).toHaveLength(1);
    expect(parsed.data?.languages).toHaveLength(1);
  });

  it("accepts a CV whose optional sections are all empty", () => {
    // No section is required: a CV with nothing but its identity block, its
    // label and a summary is a legal CV.
    const parsed = baseCvSchema.safeParse(validValues());

    expect(parsed.success).toBe(true);
    expect(parsed.data?.links).toEqual([]);
    expect(parsed.data?.skills).toEqual([]);
    expect(parsed.data?.experience).toEqual([]);
    expect(parsed.data?.projects).toEqual([]);
    expect(parsed.data?.education).toEqual([]);
    expect(parsed.data?.certifications).toEqual([]);
    expect(parsed.data?.languages).toEqual([]);
  });

  it("accepts an empty phone, because the phone is optional", () => {
    expect(baseCvSchema.safeParse(validValues({ phone: "" })).success).toBe(
      true,
    );
    expect(
      baseCvSchema.safeParse(validValues({ phone: "+44 20 7946 0958" }))
        .success,
    ).toBe(true);
  });

  it("requires the label, the full name and the email", () => {
    for (const field of ["name", "full_name", "email"] as const) {
      const parsed = baseCvSchema.safeParse(validValues({ [field]: "" }));
      expect(parsed.success, `${field} must be required`).toBe(false);
      expect(parsed.error?.issues.some((i) => i.path[0] === field)).toBe(true);
    }
  });

  it("does not let whitespace stand in for a required field", () => {
    expect(baseCvSchema.safeParse(validValues({ name: "   " })).success).toBe(
      false,
    );
  });

  it("rejects an address that is not an email", () => {
    const parsed = baseCvSchema.safeParse(
      validValues({ email: "ada.example" }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "Enter a valid email address",
    );
  });
});

describe("baseCvSchema section rows", () => {
  it("accepts a row the user added and never filled in", () => {
    // Every "Add …" control drops a blank row in; an untouched one is not an
    // error, `toBaseCvPayload` simply drops it.
    const parsed = baseCvSchema.safeParse(
      validValues({
        links: [{ id: "a", label: "", url: "" }],
        experience: [
          { id: "b", company: "", role: "", period: "", bullets: [] },
        ],
        certifications: [{ id: "c", name: "", issuer: "" }],
        skills: [{ id: "d", category: "", keywords: [] }],
        education: [
          { id: "f", institution: "", degree: "", area: "", period: "" },
        ],
      }),
    );

    expect(parsed.success).toBe(true);
  });

  it("drops a language row that has nothing but its default level", () => {
    // `level` always has a value, so a row with no name is untouched, not half
    // filled — there is nothing to complain about and nothing to send.
    const values = validValues({
      languages: [{ id: "e", name: "", level: "Native" }],
    });

    expect(baseCvSchema.safeParse(values).success).toBe(true);
    expect(toBaseCvPayload(values).languages).toEqual([]);
  });

  it("refuses a half-filled row, because the API requires the whole of it", () => {
    // The API declares every one of these fields `min_length=1`, so a row with
    // something in it has to be complete or the request is a 422 the editor
    // has no per-row slot to show.
    const cases: Array<[string, Partial<CvFormValues>, string]> = [
      [
        "links",
        { links: [{ id: "a", label: "GitHub", url: "" }] },
        "Every link needs a label and a URL. Remove the rows you do not want.",
      ],
      [
        "experience",
        {
          experience: [
            { id: "b", company: "Stripe", role: "", period: "", bullets: [] },
          ],
        },
        "Every role needs a company, a role and a period. Remove the rows you do not want.",
      ],
      [
        "projects",
        { projects: [{ id: "c", name: "", description: "Something" }] },
        "Every project needs a name. Remove the rows you do not want.",
      ],
      [
        "certifications",
        { certifications: [{ id: "d", name: "", issuer: "AWS" }] },
        "Every certification needs a name and an issuer. Remove the rows you do not want.",
      ],
      [
        "skills",
        { skills: [{ id: "e", category: "", keywords: ["Python"] }] },
        "Every skill category needs a name. Remove the categories you do not want.",
      ],
      [
        "education",
        {
          education: [
            { id: "f", institution: "Edinburgh", degree: "", period: "" },
          ],
        },
        "Every qualification needs an institution and a degree. Remove the rows you do not want.",
      ],
    ];

    for (const [field, values, message] of cases) {
      const parsed = baseCvSchema.safeParse(validValues(values));
      expect(parsed.success, `${field} must be complete`).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(message);
      expect(parsed.error?.issues[0]?.path[0]).toBe(field);
    }
  });

  it("refuses text the server would answer 422 for, before it is sent", () => {
    // `getApiError` renders FastAPI's `detail` unguarded and a 422 `detail` is
    // an ARRAY, so a server-side length failure reaches the toast as garbage.
    // Every ceiling below is at or under the server's; `keyword` has no server
    // ceiling at all, so that one is strictly stricter.
    const cases: Array<[string, Partial<CvFormValues>]> = [
      [
        "skills",
        {
          skills: [
            { id: "a", category: "x".repeat(101), keywords: ["Python"] },
          ],
        },
      ],
      [
        "skills",
        {
          skills: [{ id: "a", category: "Cloud", keywords: ["x".repeat(101)] }],
        },
      ],
      [
        "education",
        {
          education: [{ id: "b", institution: "x".repeat(201), degree: "BSc" }],
        },
      ],
      [
        "education",
        {
          education: [
            {
              id: "b",
              institution: "Edinburgh",
              degree: "BSc",
              period: "x".repeat(101),
            },
          ],
        },
      ],
    ];

    for (const [field, values] of cases) {
      const parsed = baseCvSchema.safeParse(validValues(values));
      expect(parsed.success, `${field} ceiling must hold`).toBe(false);
      expect(parsed.error?.issues[0]?.path[0]).toBe(field);
    }
  });

  it("accepts text exactly at the ceiling", () => {
    expect(
      baseCvSchema.safeParse(
        validValues({
          skills: [
            {
              id: "a",
              category: "x".repeat(BASE_CV_MAX.skillCategory),
              keywords: ["y".repeat(BASE_CV_MAX.skillKeyword)],
            },
          ],
          education: [
            {
              id: "b",
              institution: "x".repeat(BASE_CV_MAX.educationInstitution),
              degree: "y".repeat(BASE_CV_MAX.educationDegree),
              area: "z".repeat(BASE_CV_MAX.educationArea),
              period: "p".repeat(BASE_CV_MAX.educationPeriod),
            },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("hands the section message to the caller, since no row renders one", () => {
    // The pages toast this from `onInvalid`; without it a half-filled row would
    // block the submit with nothing on screen to explain why.
    expect(
      sectionErrorMessage({
        experience: { type: "custom", message: "Every role needs a company." },
      }),
    ).toBe("Every role needs a company.");
    expect(sectionErrorMessage({})).toBeUndefined();
    expect(
      sectionErrorMessage({ name: { type: "custom", message: "x" } }),
    ).toBe(undefined);
  });
});

describe("toBaseCvPayload", () => {
  it("maps an empty phone to null and keeps a real one", () => {
    expect(toBaseCvPayload(validValues({ phone: "" })).phone).toBeNull();
    expect(toBaseCvPayload(validValues({ phone: " +44 1 " })).phone).toBe(
      "+44 1",
    );
  });

  it("preserves the client-generated ids of every section item", () => {
    const payload = toBaseCvPayload(baseCvToFormValues(SAVED_CV));

    expect(payload.links[0].id).toBe("l-1");
    expect(payload.experience[0].id).toBe("e-1");
    expect(payload.projects[0].id).toBe("p-1");
    expect(payload.skills[0].id).toBe("s-1");
    expect(payload.education[0].id).toBe("d-1");
    expect(payload.certifications[0].id).toBe("c-1");
    expect(payload.languages[0].id).toBe("g-1");
  });

  it("never sends the server-owned fields", () => {
    const payload = toBaseCvPayload(baseCvToFormValues(SAVED_CV));

    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updated_at");
  });

  it("drops rows the user added and never filled in", () => {
    const payload = toBaseCvPayload(
      validValues({
        links: [{ id: "a", label: "", url: "" }],
        skills: [
          { id: "s", category: "  ", keywords: ["  "] },
          { id: "t", category: " Languages ", keywords: [" Python ", "  "] },
        ],
        education: [
          { id: "f", institution: "", degree: "", area: "", period: "" },
        ],
        experience: [
          { id: "b", company: "", role: "", period: "", bullets: ["", " "] },
        ],
        certifications: [{ id: "c", name: "", issuer: "" }],
      }),
    );

    expect(payload.links).toEqual([]);
    expect(payload.skills).toEqual([
      { id: "t", category: "Languages", keywords: ["Python"] },
    ]);
    expect(payload.education).toEqual([]);
    expect(payload.experience).toEqual([]);
    expect(payload.certifications).toEqual([]);
  });
});

describe("baseCvToFormValues", () => {
  it("turns a null phone into the empty string the input needs", () => {
    expect(baseCvToFormValues(SAVED_CV).phone).toBe("");
  });

  it("round-trips a saved CV through the form and back unchanged", () => {
    const payload = toBaseCvPayload(baseCvToFormValues(SAVED_CV));

    expect(payload).toEqual({
      name: SAVED_CV.name,
      full_name: SAVED_CV.full_name,
      headline: SAVED_CV.headline,
      location: SAVED_CV.location,
      email: SAVED_CV.email,
      phone: null,
      summary: SAVED_CV.summary,
      links: SAVED_CV.links,
      skills: SAVED_CV.skills,
      experience: SAVED_CV.experience,
      projects: SAVED_CV.projects,
      education: SAVED_CV.education,
      certifications: SAVED_CV.certifications,
      languages: SAVED_CV.languages,
    });
  });
});

describe("BaseCvEditor", () => {
  it("captures the identity block, the summary and a link, and submits them", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await user.type(screen.getByLabelText("CV label"), "Backend CV");
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Headline"), "Senior Engineer");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Phone"), "+44 20 7946 0958");
    await user.type(screen.getByLabelText("Location"), "London");
    await user.type(
      screen.getByLabelText("Summary"),
      "Eight years on payments.",
    );

    // Skills are CATEGORIES with keywords inside, never a flat tag list.
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

    await user.click(screen.getByRole("button", { name: "Add link" }));
    const link = within(screen.getByRole("group", { name: "link 1" }));
    await user.type(link.getByLabelText("Label"), "GitHub");
    await user.type(link.getByLabelText("URL"), "https://github.com/ada");

    await user.click(screen.getByRole("button", { name: "Create CV" }));

    expect(onValid).toHaveBeenCalledTimes(1);
    expect(onValid.mock.calls[0][0]).toMatchObject({
      name: "Backend CV",
      full_name: "Ada Lovelace",
      headline: "Senior Engineer",
      email: "ada@example.com",
      phone: "+44 20 7946 0958",
      location: "London",
      summary: "Eight years on payments.",
      skills: [
        {
          id: "new-1",
          category: "Languages and frameworks",
          keywords: ["Python"],
        },
      ],
      links: [{ id: "new-2", label: "GitHub", url: "https://github.com/ada" }],
    });
  });

  it("hands every one of the eight sections to the caller on submit", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(
      <Harness defaults={baseCvToFormValues(SAVED_CV)} onValid={onValid} />,
    );

    await user.click(screen.getByRole("button", { name: "Create CV" }));

    expect(onValid).toHaveBeenCalledTimes(1);
    const values = onValid.mock.calls[0][0] as CvFormValues;
    expect(values.summary).toBe(SAVED_CV.summary);
    expect(values.links).toHaveLength(1);
    expect(values.skills).toEqual([
      {
        id: "s-1",
        category: "Languages and frameworks",
        keywords: ["Python", "PostgreSQL"],
      },
    ]);
    expect(values.experience[0]).toMatchObject({
      company: "Stripe",
      role: "Senior Backend Engineer",
      bullets: ["Cut settlement latency by 40%"],
    });
    expect(values.projects[0]).toMatchObject({ name: "difference-engine" });
    expect(values.education[0]).toMatchObject({
      institution: "University of Edinburgh",
      degree: "BSc",
      area: "Computer Science",
      period: "2010 — 2013",
    });
    expect(values.certifications[0]).toMatchObject({ name: "AWS SAA" });
    expect(values.languages[0]).toMatchObject({
      name: "English",
      level: "Native",
    });
  });

  it("blocks the submit and shows the inline errors the required fields carry", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await user.click(screen.getByRole("button", { name: "Create CV" }));

    expect(onValid).not.toHaveBeenCalled();
    expect(
      await screen.findByText("A CV label is required"),
    ).toBeInTheDocument();
    expect(screen.getByText("Your full name is required")).toBeInTheDocument();
    expect(screen.getByText("An email is required")).toBeInTheDocument();
  });

  it("carries the export beside the submit, both reachable (KODI-004)", () => {
    render(
      <Harness
        onValid={() => {}}
        actions={<ExportCvButton onExport={() => {}} />}
      />,
    );

    // The `actions` slot is what the PDF export hangs off. Saving is still the
    // primary action; the export sits beside it and neither disables the other.
    expect(
      screen.getByRole("button", { name: CV_PDF_EXPORT_LABEL }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create CV" })).toBeEnabled();
  });

  it("captures a qualification and hands the education section over (AC4)", async () => {
    // The owner: "I never said to cut out education, only key achievements."
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness defaults={validValues()} onValid={onValid} />);

    await user.click(screen.getByRole("button", { name: "Add education" }));
    const row = within(screen.getByRole("group", { name: "education 1" }));
    await user.type(row.getByLabelText("Institution"), "University of Bath");
    await user.type(row.getByLabelText("Degree"), "MSc");
    await user.type(row.getByLabelText("Field of study"), "Data Science");
    await user.type(row.getByLabelText("Period"), "2018 — 2019");

    await user.click(screen.getByRole("button", { name: "Create CV" }));

    expect(onValid).toHaveBeenCalledTimes(1);
    const values = onValid.mock.calls[0][0] as CvFormValues;
    expect(values.education).toEqual([
      {
        id: "new-1",
        institution: "University of Bath",
        degree: "MSc",
        area: "Data Science",
        period: "2018 — 2019",
      },
    ]);
    // And it reaches the wire the same way, `area` and `period` included.
    expect(toBaseCvPayload(values).education).toEqual([
      {
        id: "new-1",
        institution: "University of Bath",
        degree: "MSc",
        area: "Data Science",
        period: "2018 — 2019",
      },
    ]);
  });

  it("positions the Level field, so its hidden native select is contained (AC7)", async () => {
    // Radix `Select` renders a visually hidden native `<select>` at
    // `position: absolute`. With no positioned ancestor its containing block
    // is the initial one and it stretches the DOCUMENT, which is the page
    // scroll the owner saw on `/cvs/new`. The e2e suite measures the scroll;
    // this pins the contract that prevents it.
    const user = userEvent.setup();
    render(<Harness onValid={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add language" }));
    const row = screen.getByRole("group", { name: "language 1" });
    const level = within(row).getByRole("combobox", { name: "Level" });
    const wrapper = level.closest("div.space-y-1\\.5") as HTMLElement;

    expect(wrapper.className).toContain("relative");
  });

  it("renders every section of the CV, in the order the design fixes", () => {
    render(<Harness onValid={vi.fn()} />);

    // The live preview is a second CV surface with headings of its own, so the
    // outline assertion is scoped to the form column.
    const preview = screen.getByRole("complementary", { name: "CV preview" });

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .filter((heading) => !preview.contains(heading))
        .map((heading) => heading.textContent),
    ).toEqual([
      "Identity and contact",
      "Summary",
      "Links",
      "Skills",
      "Experience",
      "Projects",
      "Education",
      "Certifications",
      "Languages",
    ]);
  });
});

describe("NewCvCard at the cap", () => {
  it("disables the create affordance once the user holds three CVs", () => {
    render(<NewCvCard href="/cvs/new" count={BASE_CVS_MAX} />);

    // A real disabled BUTTON, not a link that looks disabled.
    const create = screen.getByRole("button", { name: "New master CV" });
    expect(create).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "New master CV" }),
    ).not.toBeInTheDocument();
  });

  it("says the limit is three, on screen, tied to the disabled control", () => {
    render(<NewCvCard href="/cvs/new" count={BASE_CVS_MAX} />);

    // Visible text, not a tooltip and not a title attribute.
    const reason = screen.getByText(BASE_CV_LIMIT_REASON);
    expect(reason).toBeVisible();
    expect(BASE_CV_LIMIT_REASON).toContain("the limit is three");
    expect(
      screen.getByRole("button", { name: "New master CV" }),
    ).toHaveAccessibleDescription(BASE_CV_LIMIT_REASON);
  });

  it("offers the create link while a slot is free, and counts what is left", () => {
    render(<NewCvCard href="/cvs/new" count={1} />);

    expect(screen.getByRole("link", { name: "New master CV" })).toHaveAttribute(
      "href",
      "/cvs/new",
    );
    expect(screen.getByText("2 of 3 slots left")).toBeInTheDocument();
    expect(screen.queryByText(BASE_CV_LIMIT_REASON)).not.toBeInTheDocument();
  });
});
