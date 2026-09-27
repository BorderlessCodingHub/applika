import { render, screen, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import {
  ApplicationFields,
  type ApplicationFieldsValues,
} from "@/components/applications/application-fields";
import { DraftApplicationStep } from "@/components/application-drafts/draft-application-step";

/**
 * KODI-035 T110/B2, revised KODI-036: a committed test asserting the
 * three-section layout itself — heading order AND level per call site, the
 * field labels inside each section, and the responsive ROW2/ROW3 container-query
 * grid classes. Since KODI-036 both callers ask for the application date (AC3,
 * AC4): `showDate` is gone, `className` carries no width limit of its own
 * (AC5), and the date shares its row with the job link.
 */

vi.mock("@/hooks/use-create-company", () => ({
  useCreateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function Harness({
  sectionHeadingAs,
  className,
}: {
  sectionHeadingAs?: "h2" | "h3";
  className?: string;
}) {
  const form = useForm<ApplicationFieldsValues>({
    defaultValues: { platform_id: "", role: "", mode: "active" },
  });
  return (
    <ApplicationFields
      form={form}
      fetchCompanies={vi.fn().mockResolvedValue([])}
      platforms={[]}
      onCreatePlatform={vi.fn()}
      sectionHeadingAs={sectionHeadingAs}
      className={className}
    />
  );
}

describe("ApplicationFields — three-section layout (KODI-035 T110, KODI-036 AC3-AC5, AC10-AC14)", () => {
  it("renders the three sections as h3, in order, in the sheet (default heading level)", () => {
    render(<Harness />);

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Role & company",
      "Details",
      "Posting & notes",
    ]);
  });

  it("renders the same three sections as h2, with no width limit of its own, on the new-with-cv page", () => {
    const { container } = render(<Harness sectionHeadingAs="h2" />);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Role & company",
      "Details",
      "Posting & notes",
    ]);

    const root = container.querySelector('[data-slot="application-fields"]');
    expect(root?.className).not.toMatch(/max-w-/);

    // AC3/AC4: the application date is asked on BOTH forms now.
    expect(screen.getByText(/application date/i)).toBeInTheDocument();
  });

  it("no <section> carries a card/box class — AC10 (flat, card-free)", () => {
    const { container } = render(<Harness />);
    for (const section of container.querySelectorAll(
      '[data-slot="form-section"]',
    )) {
      expect(section.className).not.toMatch(/\bcard\b/i);
      expect(section.className).not.toMatch(/shadow/);
    }
  });

  it("every section title has a muted description above the fields and no icon — AC11", () => {
    const { container } = render(<Harness />);
    const sections = container.querySelectorAll('[data-slot="form-section"]');
    expect(sections).toHaveLength(3);
    for (const section of sections) {
      const description = section.querySelector(
        '[data-slot="form-section-description"]',
      );
      expect(description).not.toBeNull();
      expect(description?.className).toContain("text-muted-foreground");
      // No icon beside the section TITLE itself (fields may still have their
      // own icons, e.g. a Select's chevron).
      const title = section.querySelector('[data-slot="form-section-title"]');
      expect(title?.querySelector("svg")).toBeNull();
    }
  });

  it("every section carries the hairline-divider rule (AC12) — a CSS sibling selector that only paints on the SECOND+ section, so jsdom sees it on all three", () => {
    const { container } = render(<Harness />);
    const sections = Array.from(
      container.querySelectorAll('[data-slot="form-section"]'),
    );
    expect(sections).toHaveLength(3);
    for (const section of sections) {
      expect(section.className).toContain(
        "[[data-slot=form-section]+&]:border-t",
      );
    }
  });

  it("Role & company section: role/source, company/platform, then date + job link on one line — AC3/AC4", () => {
    render(<Harness />);
    const section = screen
      .getByRole("heading", {
        name: "Role & company",
      })
      .closest('[data-slot="form-section"]') as HTMLElement;
    const scoped = within(section);

    expect(scoped.getByLabelText(/^role/i)).toBeInTheDocument();
    expect(
      scoped.getByRole("combobox", { name: "Source" }),
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("combobox", { name: "Company" }),
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("combobox", { name: "Platform" }),
    ).toBeInTheDocument();
    const dateField = scoped.getByLabelText(/application date/i);
    const jobLinkField = scoped.getByLabelText(/^job link/i);
    expect(dateField).toBeInTheDocument();
    expect(jobLinkField).toBeInTheDocument();
    // Same row (AC4): the date and the job link share one grid container.
    const row = (el: HTMLElement) =>
      el.closest('[class*="@md/app-form:grid-cols-2"]');
    expect(row(dateField)).toBe(row(jobLinkField));
    // AC4 also pins the ORDER: the date comes first, then the job link.
    expect(
      dateField.compareDocumentPosition(jobLinkField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Details section: work mode/experience/country, currency/period, expected/min/max", () => {
    render(<Harness />);
    const section = screen
      .getByRole("heading", { name: "Details" })
      .closest('[data-slot="form-section"]') as HTMLElement;
    const scoped = within(section);

    expect(scoped.getByLabelText(/work mode/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/experience level/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^country/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^currency/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/salary period/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^expected/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^min/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^max/i)).toBeInTheDocument();
  });

  it("Posting & notes section: job description first, then Additional notes", () => {
    render(<Harness />);
    const section = screen
      .getByRole("heading", { name: "Posting & notes" })
      .closest('[data-slot="form-section"]') as HTMLElement;
    const scoped = within(section);

    const jobDescription = scoped.getByLabelText(/job description/i);
    const notes = scoped.getByLabelText(/additional notes/i);
    expect(jobDescription).toBeInTheDocument();
    expect(notes).toBeInTheDocument();
    expect(
      jobDescription.compareDocumentPosition(notes) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the responsive ROW2/ROW3 container-query grid classes on the paired/tripled rows", () => {
    render(<Harness />);

    const gridClass = (selector: string) => `[class*="${selector}"]`;

    const roleInput = screen.getByLabelText(/^role/i);
    expect(
      roleInput.closest(gridClass("@md/app-form:grid-cols-2")),
    ).not.toBeNull();

    const companyTrigger = screen.getByRole("combobox", {
      name: "Company",
    });
    expect(
      companyTrigger.closest(gridClass("@md/app-form:grid-cols-2")),
    ).not.toBeNull();

    const currencyTrigger = screen.getByLabelText(/^currency/i);
    expect(
      currencyTrigger.closest(gridClass("@md/app-form:grid-cols-2")),
    ).not.toBeNull();

    const workModeTrigger = screen.getByLabelText(/work mode/i);
    expect(
      workModeTrigger.closest(gridClass("@md/app-form:grid-cols-3")),
    ).not.toBeNull();

    // Expected/Min/Max salary trio is also a ROW3.
    const expectedInput = screen.getByLabelText(/^expected/i);
    expect(
      expectedInput.closest(gridClass("@md/app-form:grid-cols-3")),
    ).not.toBeNull();
  });
});

function DraftHarness() {
  const form = useForm<ApplicationFieldsValues>({
    defaultValues: {
      platform_id: "",
      role: "",
      mode: "active",
      application_date: "2026-01-01",
    },
  });
  return (
    <DraftApplicationStep
      form={form}
      fetchCompanies={vi.fn().mockResolvedValue([])}
      companySelectValue={null}
      onCompanyChange={vi.fn()}
      platforms={[]}
      onCreatePlatform={vi.fn()}
    />
  );
}

describe("DraftApplicationStep — what the new-with-cv page actually passes (KODI-036)", () => {
  it("renders h2 sections, no width limit of its own, and the application date", () => {
    const { container } = render(<DraftHarness />);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Role & company", "Details", "Posting & notes"]);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    const root = container.querySelector('[data-slot="application-fields"]');
    expect(root?.className).not.toMatch(/max-w-/);
    expect(screen.getByText(/application date/i)).toBeInTheDocument();
  });
});

describe("ApplicationFields — row grouping (QA round 2 M10/M11)", () => {
  it("declares the @container/app-form the row classes query", () => {
    const { container } = render(<Harness />);
    const root = container.querySelector('[data-slot="application-fields"]');
    expect(root?.className).toContain("@container/app-form");
  });

  it("puts paired and tripled fields in the same row element", () => {
    render(<Harness />);
    const row = (el: HTMLElement) =>
      el.closest('[class*="@md/app-form:grid-cols-"]');

    expect(row(screen.getByRole("combobox", { name: "Company" }))).toBe(
      row(screen.getByRole("combobox", { name: "Platform" })),
    );
    expect(row(screen.getByLabelText(/^role/i))).toBe(
      row(screen.getByRole("combobox", { name: "Source" })),
    );
    const workMode = row(screen.getByLabelText(/work mode/i));
    expect(row(screen.getByLabelText(/experience level/i))).toBe(workMode);
    expect(row(screen.getByLabelText(/^country/i))).toBe(workMode);
    expect(row(screen.getByLabelText(/salary period/i))).toBe(
      row(screen.getByLabelText(/^currency/i)),
    );
    const salary = row(screen.getByLabelText(/^expected/i));
    expect(row(screen.getByLabelText(/^min/i))).toBe(salary);
    expect(row(screen.getByLabelText(/^max/i))).toBe(salary);
  });
});
