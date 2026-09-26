import { render, screen, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import {
  ApplicationFields,
  type ApplicationFieldsValues,
} from "@/components/applications/application-fields";

/**
 * KODI-035 T110/B2 (frontend-qa round 1): a committed test asserting the
 * three-section layout itself — heading order AND level per call site, the
 * field labels inside each section, the `max-w-4xl` root class the draft page
 * passes, and the responsive ROW2/ROW3 container-query grid classes. Before
 * this test, only the FIELDS were asserted (via `application-form-sheet.test.tsx`
 * and `new-with-cv-page.test.tsx`), never the section grouping or the grid
 * classes that make AC4/AC5's "one line each" true above `@md/app-form`.
 */

vi.mock("@/hooks/use-create-company", () => ({
  useCreateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function Harness({
  showDate,
  sectionHeadingAs,
  className,
}: {
  showDate?: boolean;
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
      showDate={showDate}
      sectionHeadingAs={sectionHeadingAs}
      className={className}
    />
  );
}

describe("ApplicationFields — three-section layout (KODI-035 T110, AC3-AC6)", () => {
  it("renders the three sections as h3, in order, in the sheet (showDate, default heading level)", () => {
    render(<Harness showDate />);

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Role & company",
      "Details",
      "Posting & notes",
    ]);
  });

  it("renders the same three sections as h2, with max-w-4xl, on the new-with-cv page (showDate=false)", () => {
    const { container } = render(
      <Harness showDate={false} sectionHeadingAs="h2" className="max-w-4xl" />,
    );

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Role & company",
      "Details",
      "Posting & notes",
    ]);

    const root = container.querySelector('[data-slot="application-fields"]');
    expect(root?.className).toContain("max-w-4xl");

    // AC4: no application date question on the draft page.
    expect(screen.queryByText(/application date/i)).not.toBeInTheDocument();
  });

  it("Role & company section: role/source, company/platform, job link, and (sheet only) the date", () => {
    render(<Harness showDate />);
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
    expect(scoped.getByLabelText(/^job link/i)).toBeInTheDocument();
    expect(scoped.getByText(/application date/i)).toBeInTheDocument();
  });

  it("Details section: work mode/experience/country, currency/period, expected/min/max", () => {
    render(<Harness showDate />);
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
    render(<Harness showDate />);
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
    render(<Harness showDate />);

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
