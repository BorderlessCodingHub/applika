import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { BaseCvEditor } from "./base-cv-editor";
import {
  baseCvSchema,
  emptyBaseCvValues,
  sectionErrorMessage,
} from "./base-cv-schema";
import { CV_FORM_SECTION_IDS } from "./cv-form-sections";
import type { CvFormValues } from "./types";

/**
 * The CV form's disclosures (KODI-009 / AC4, AC5, AC6, AC7).
 *
 * The owner: "make each section in the form colapsable, do the same to each
 * experience inside Experience section (keep open as default when i open the
 * page) and change the links position to above summary".
 *
 * Four properties are pinned here:
 *
 * - AC4 — every section is a disclosure and every one of them is OPEN when the
 *   page opens.
 * - AC5 — every Experience entry is its own disclosure, they move
 *   independently of each other, and a row added later is born open.
 * - AC6 — a collapsed section or row that holds a validation error is forced
 *   open by the submit, so the message and the field it points at are on
 *   screen. This is the property the ticket calls out by name.
 * - AC7 — the form's order is identity, LINKS, summary, then the rest. Pinned
 *   a second time here against the named contract `CV_FORM_SECTION_IDS`; the
 *   heading-text pin lives in `base-cv-editor.test.tsx`.
 *
 * `aria-expanded` is the assertion, never `aria-controls`: Radix only points
 * the trigger at its panel while the panel is mounted, so `aria-controls`
 * disappears on the very state this file is about.
 *
 * The typeset document's section order is NOT this order and is not touched
 * here — it is pinned against the server's `mapper.py` in `cv-document.test.tsx`.
 */

/** The nine section headers, in the order the owner asked for. */
const SECTION_TITLES = [
  "Identity and contact",
  "Links",
  "Summary",
  "Skills",
  "Experience",
  "Projects",
  "Education",
  "Certifications",
  "Languages",
] as const;

function values(over: Partial<CvFormValues> = {}): CvFormValues {
  return {
    ...emptyBaseCvValues(),
    name: "Backend CV",
    full_name: "Ada Lovelace",
    headline: "Senior Backend Engineer",
    location: "London, United Kingdom",
    email: "ada@example.com",
    summary: "Eight years on payment systems.",
    ...over,
  };
}

/** Two complete roles, so an invalid third is the only thing that can fail. */
const TWO_ROLES = [
  {
    id: "e-1",
    company: "Stripe",
    role: "Senior Backend Engineer",
    start: "2021-03",
    bullets: [],
  },
  {
    id: "e-2",
    company: "Monzo",
    role: "Backend Engineer",
    start: "2018-01",
    end: "2021-02",
    bullets: [],
  },
];

function Harness({
  defaults,
  onValid = vi.fn(),
  onInvalid,
}: {
  defaults?: CvFormValues;
  onValid?: (values: CvFormValues) => void;
  onInvalid?: (message: string | undefined) => void;
}) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(baseCvSchema),
    defaultValues: defaults ?? values(),
  });
  return (
    <BaseCvEditor
      form={form}
      onSubmit={form.handleSubmit(onValid, (errors) =>
        onInvalid?.(sectionErrorMessage(errors)),
      )}
      submitLabel="Save CV"
      newItemId={(() => {
        let n = 0;
        return () => `new-${++n}`;
      })()}
    />
  );
}

/** The disclosure button of one section, by its visible title. */
function sectionTrigger(title: string): HTMLElement {
  return screen.getByRole("button", { name: title });
}

/** The disclosure button of one Experience row, by its caption and position. */
function rowTrigger(caption: string, position: string): HTMLElement {
  return screen.getByRole("button", { name: `${caption}, ${position}` });
}

describe("the CV form's section disclosures (AC4, AC7)", () => {
  it("renders the nine sections in the owner's order, links above summary", () => {
    // The named contract the editor and the tailored copy both render from.
    expect([...CV_FORM_SECTION_IDS]).toEqual([
      "identity",
      "links",
      "summary",
      "skills",
      "experience",
      "projects",
      "education",
      "certifications",
      "languages",
    ]);
    expect(CV_FORM_SECTION_IDS.indexOf("links")).toBeLessThan(
      CV_FORM_SECTION_IDS.indexOf("summary"),
    );
  });

  it("opens every section expanded, the way the page opens", () => {
    render(<Harness />);

    for (const title of SECTION_TITLES) {
      expect(sectionTrigger(title)).toHaveAttribute("aria-expanded", "true");
    }
    // Nine, not eight and not ten: no section escaped the disclosure.
    expect(SECTION_TITLES).toHaveLength(CV_FORM_SECTION_IDS.length);
  });

  it("collapses and re-expands a section, and hides its fields while closed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = sectionTrigger("Summary");
    expect(screen.getByLabelText("Summary")).toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Summary")).toBeInTheDocument();
  });

  it("collapses one section without touching its neighbours", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(sectionTrigger("Projects"));

    expect(sectionTrigger("Projects")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    for (const title of SECTION_TITLES.filter((t) => t !== "Projects")) {
      expect(sectionTrigger(title)).toHaveAttribute("aria-expanded", "true");
    }
  });

  it("keeps the Add control usable while its section header is a button", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // The Add button is a SIBLING of the trigger, never nested in it, so
    // pressing it adds a row instead of folding the section away.
    await user.click(screen.getByRole("button", { name: "Add link" }));

    expect(sectionTrigger("Links")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "link 1" })).toBeInTheDocument();
  });
});

describe("the Experience entries' own disclosures (AC5)", () => {
  it("opens every entry expanded and moves them independently", async () => {
    const user = userEvent.setup();
    render(<Harness defaults={values({ experience: TWO_ROLES })} />);

    const first = rowTrigger("Senior Backend Engineer", "experience 1");
    const second = rowTrigger("Backend Engineer", "experience 2");
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "true");

    await user.click(first);

    expect(first).toHaveAttribute("aria-expanded", "false");
    // Independent: closing role 1 leaves role 2 exactly as it was.
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(
      within(
        screen.getByRole("group", { name: "experience 1" }),
      ).queryByLabelText("Company"),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", { name: "experience 2" }),
      ).getByLabelText("Company"),
    ).toBeInTheDocument();
  });

  it("gives a row added later an open disclosure of its own", async () => {
    const user = userEvent.setup();
    render(<Harness defaults={values({ experience: TWO_ROLES })} />);

    // Close what is there, so an inherited state would show up as a closed row.
    await user.click(rowTrigger("Senior Backend Engineer", "experience 1"));
    await user.click(rowTrigger("Backend Engineer", "experience 2"));

    await user.click(screen.getByRole("button", { name: "Add experience" }));

    const born = rowTrigger("New role", "experience 3");
    expect(born).toHaveAttribute("aria-expanded", "true");
    expect(
      within(
        screen.getByRole("group", { name: "experience 3" }),
      ).getByLabelText("Company"),
    ).toBeInTheDocument();
  });

  it("puts a disclosure on Experience rows only, not on every list", () => {
    render(
      <Harness
        defaults={values({
          experience: TWO_ROLES,
          projects: [
            { id: "p-1", name: "difference-engine", description: "In Rust." },
          ],
        })}
      />,
    );

    expect(
      rowTrigger("Senior Backend Engineer", "experience 1"),
    ).toBeInTheDocument();
    // A project row keeps its plain caption: the owner asked for Experience.
    expect(
      screen.queryByRole("button", { name: "difference-engine, project 1" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "project 1" })).getByLabelText(
        "Name",
      ),
    ).toBeInTheDocument();
  });
});

describe("a submit never hides an error behind a collapsed header (AC6)", () => {
  it("re-opens a collapsed section and puts its message on screen", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness defaults={values({ summary: "" })} onValid={onValid} />);

    const trigger = sectionTrigger("Summary");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("A summary is required")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save CV" }));

    expect(onValid).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // The message AND the field it points at, both really on screen.
    expect(screen.getByText("A summary is required")).toBeVisible();
    expect(screen.getByLabelText("Summary")).toBeVisible();
  });

  it("re-opens a collapsed identity block for a scalar it hides", async () => {
    const user = userEvent.setup();
    render(<Harness defaults={values({ email: "not-an-email" })} />);

    const trigger = sectionTrigger("Identity and contact");
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Save CV" }));

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription();
  });

  it("re-opens a collapsed Experience ROW and the section above it", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    render(
      <Harness
        onValid={onValid}
        onInvalid={onInvalid}
        defaults={values({
          experience: [
            // Half-filled: a company, no role and no start. The schema refuses
            // the whole array, so there is no per-index path to point at.
            {
              id: "e-1",
              company: "Stripe",
              role: "",
              start: "",
              bullets: [],
            },
            ...TWO_ROLES.slice(1),
          ],
        })}
      />,
    );

    const row = rowTrigger("Stripe", "experience 1");
    await user.click(row);
    await user.click(sectionTrigger("Experience"));
    expect(sectionTrigger("Experience")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Save CV" }));

    expect(onValid).not.toHaveBeenCalled();
    // Section first, then the row inside it: both had to reopen for the user
    // to reach the fields the message is about.
    expect(sectionTrigger("Experience")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(rowTrigger("Stripe", "experience 1")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const fields = within(screen.getByRole("group", { name: "experience 1" }));
    expect(fields.getByLabelText("Role")).toBeVisible();
    expect(fields.getByLabelText("Start")).toBeVisible();
    // The section list has no inline slot, so the words travel by toast — the
    // editor routes pass exactly this string to `toast.error`.
    expect(onInvalid).toHaveBeenCalledWith(
      "Every role needs a company, a role and a start month and year (MM/yyyy). Remove the rows you do not want.",
    );
  });

  it("keeps a revealed section open while the user fixes it, and keeps focus", async () => {
    // The reveal is COMMITTED, not derived for as long as the error lasts.
    // Derived, the section folded away again the instant the field became
    // valid — the error cleared, the reveal with it, and the stored "closed"
    // reasserted itself over the textarea the user was typing in. That is an
    // unrequested context change on input (WCAG 3.2.2) in the very flow AC6
    // exists to protect, and it sent keyboard focus to `<body>`.
    const user = userEvent.setup();
    render(<Harness defaults={values({ summary: "" })} />);

    await user.click(sectionTrigger("Summary"));
    await user.click(screen.getByRole("button", { name: "Save CV" }));
    expect(sectionTrigger("Summary")).toHaveAttribute("aria-expanded", "true");

    const field = screen.getByLabelText("Summary");
    await user.type(field, "Eight years on payment systems.");

    // Still open, still the same field, still focused.
    expect(sectionTrigger("Summary")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Summary")).toBeVisible();
    expect(document.activeElement).toBe(field);
    expect(screen.queryByText("A summary is required")).not.toBeInTheDocument();
  });

  it("keeps a revealed Experience ROW open while the user fixes it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        defaults={values({
          experience: [
            { id: "e-1", company: "Stripe", role: "", start: "", bullets: [] },
          ],
        })}
      />,
    );

    await user.click(rowTrigger("Stripe", "experience 1"));
    await user.click(screen.getByRole("button", { name: "Save CV" }));
    expect(rowTrigger("Stripe", "experience 1")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    const row = within(screen.getByRole("group", { name: "experience 1" }));
    await user.type(row.getByLabelText("Role"), "Senior Backend Engineer");
    const start = row.getByLabelText("Start");
    await user.type(start, "032021");

    // The last keystroke is the one that clears the array-level error. The row
    // must not vanish under the cursor on it.
    expect(
      rowTrigger("Senior Backend Engineer", "experience 1"),
    ).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(start);
    expect(start).toHaveValue("03/2021");
  });

  it("lets the user close a revealed section again, and re-reveals on the next submit", async () => {
    const user = userEvent.setup();
    render(<Harness defaults={values({ summary: "" })} />);

    await user.click(screen.getByRole("button", { name: "Save CV" }));
    expect(screen.getByText("A summary is required")).toBeVisible();

    // Reopening is one-way per submit, not a lock: the user stays in charge.
    await user.click(sectionTrigger("Summary"));
    expect(sectionTrigger("Summary")).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "Save CV" }));
    expect(sectionTrigger("Summary")).toHaveAttribute("aria-expanded", "true");
  });
});
