import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import {
  baseCvSchema,
  emptyBaseCvValues,
} from "@/components/base-cvs/base-cv-schema";
import { CV_FORM_SECTION_IDS } from "@/components/base-cvs/cv-form-sections";
import {
  CvSectionCard,
  CvSectionFrame,
} from "@/components/base-cvs/cv-section-card";
import type { CvFormValues } from "@/components/base-cvs/types";
import { PhoneCvSections } from "@/components/phone/phone-cv-sections";

const FILLED: CvFormValues = {
  ...emptyBaseCvValues(),
  name: "Backend CV",
  full_name: "Sam Carter",
  headline: "Backend Engineer",
  summary: "Twelve chars",
  links: [
    { id: "l1", label: "GitHub", url: "https://github.com/sam" },
    { id: "l2", label: "Site", url: "https://sam.dev" },
  ] as CvFormValues["links"],
  skills: [
    { id: "s1", category: "Languages", keywords: ["Python", "Go", "SQL"] },
    { id: "s2", category: "Cloud", keywords: ["AWS", "GCP"] },
  ],
};

function Harness({
  values = FILLED,
  headingLevel,
  onValid = vi.fn(),
}: {
  values?: CvFormValues;
  headingLevel?: "h2" | "h3";
  onValid?: () => void;
}) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(baseCvSchema),
    defaultValues: values,
  });
  return (
    <form noValidate onSubmit={form.handleSubmit(onValid)}>
      <PhoneCvSections form={form} headingLevel={headingLevel} />
      <button type="submit">Save</button>
    </form>
  );
}

const row = (id: string) =>
  document.querySelector(`[data-slot="cv-acc"][data-section="${id}"]`)!;

describe("PhoneCvSections", () => {
  it("draws every section of today's form as a v2/CVEditor row, Identity open first", () => {
    const { container } = render(<Harness />);

    const rows = container.querySelectorAll('[data-slot="cv-acc"]');
    expect(
      Array.from(rows).map((item) => item.getAttribute("data-section")),
    ).toEqual([...CV_FORM_SECTION_IDS]);
    expect(container.querySelector(".ph-group.ph-ce-list")).not.toBeNull();

    const identity = screen.getByRole("button", {
      name: "Identity and contact",
    });
    expect(identity).toHaveClass("ph-acc");
    expect(identity).toHaveAttribute("aria-expanded", "true");
    expect(identity).toHaveAccessibleDescription(
      "Sam Carter · Backend Engineer",
    );
    expect(identity.closest("h2")).not.toBeNull();
    // Today's fields, inside the open panel.
    expect(
      within(row("identity") as HTMLElement).getByDisplayValue("Sam Carter"),
    ).toBeInTheDocument();

    const links = screen.getByRole("button", { name: "Links" });
    expect(links).toHaveAttribute("aria-expanded", "false");
    expect(links).toHaveAccessibleDescription("2 links");
    expect(
      screen.getByRole("button", { name: "Summary" }),
    ).toHaveAccessibleDescription("12 characters");
    expect(
      screen.getByRole("button", { name: "Skills" }),
    ).toHaveAccessibleDescription("2 groups · 5 keywords");
    expect(
      screen.getByRole("button", { name: "Experience" }),
    ).toHaveAccessibleDescription("None yet");
    // A closed row's panel holds nothing.
    expect(
      document.getElementById(links.getAttribute("aria-controls")!),
    ).toBeEmptyDOMElement();
  });

  it("opens one row at a time, as the board does, with the section's hint", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Links" }));
    expect(screen.getByRole("button", { name: "Links" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Identity and contact" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(row("links")).toHaveAttribute("data-open");
    expect(
      within(row("links") as HTMLElement).getByText(
        "Portfolio, GitHub, LinkedIn and other profiles.",
      ),
    ).toBeInTheDocument();

    // A second tap folds it.
    await user.click(screen.getByRole("button", { name: "Links" }));
    expect(screen.getByRole("button", { name: "Links" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens every section holding an error after a submit, marked Needs a fix", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness values={{ ...FILLED, full_name: "" }} onValid={onValid} />);
    await user.click(screen.getByRole("button", { name: "Links" }));
    expect(
      screen.getByRole("button", { name: "Identity and contact" }),
    ).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "Save" }));

    const identity = screen.getByRole("button", {
      name: "Identity and contact",
    });
    expect(identity).toHaveAttribute("aria-expanded", "true");
    expect(identity).toHaveAccessibleDescription("Needs a fix");
    expect(row("identity")).toHaveAttribute("data-invalid");
    expect(onValid).not.toHaveBeenCalled();
  });

  it("says None yet for an empty row, Identity and Skills included", () => {
    render(<Harness values={emptyBaseCvValues()} />);
    for (const name of ["Identity and contact", "Skills", "Links"]) {
      expect(screen.getByRole("button", { name })).toHaveAccessibleDescription(
        "None yet",
      );
    }
  });

  it("uses h3 rows under the draft's own h2", () => {
    render(<Harness headingLevel="h3" />);
    expect(
      screen.getByRole("heading", { level: 3, name: "Links" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });
});

describe("CvSectionCard without a CvSectionFrame", () => {
  it("renders exactly as before: the section id is never rendered", () => {
    const withId = render(
      <CvSectionCard
        title="Links"
        description="Your profiles"
        sectionId="links"
      >
        <p>fields</p>
      </CvSectionCard>,
    );
    const html = withId.container.innerHTML;
    withId.unmount();
    const without = render(
      <CvSectionCard title="Links" description="Your profiles">
        <p>fields</p>
      </CvSectionCard>,
    );

    const stable = (markup: string) => markup.replace(/radix-_r_\w+_/g, "id");
    expect(stable(html)).toBe(stable(without.container.innerHTML));
    expect(html).not.toContain('links"');
    expect(
      without.container.querySelector('[data-slot="cv-section-header"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Links" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Links" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("hands a frame the card's words and fields, and renders what it returns", () => {
    const frame = vi.fn(
      ({
        sectionId,
        title,
        children,
      }: {
        sectionId?: string;
        title: string;
        children: React.ReactNode;
      }) => (
        <section data-testid={`frame-${sectionId}`} aria-label={title}>
          {children}
        </section>
      ),
    );
    render(
      <CvSectionFrame.Provider value={frame}>
        <CvSectionCard
          title="Links"
          description="Your profiles"
          sectionId="links"
        >
          <p>fields</p>
        </CvSectionCard>
      </CvSectionFrame.Provider>,
    );

    expect(frame).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: "links",
        title: "Links",
        description: "Your profiles",
      }),
    );
    expect(
      within(screen.getByTestId("frame-links")).getByText("fields"),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="cv-section-header"]'),
    ).toBeNull();
  });
});
