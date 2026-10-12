import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { CvFormValues } from "@/components/base-cvs/types";
import type { CvDiffSnapshot } from "./cv-diff";
import { TailoredCvEditor } from "./tailored-cv-editor";
import { tailoredCvSchema } from "./tailored-cv-schema";
import type { TailoredCvAdjustment } from "./types";
import { useCvDiff } from "./use-cv-diff";

/**
 * The diff UI wired end to end (KODI-017 part 2): the hook building the
 * marker/added/removed slots from a real baseline and a real form, rendered
 * through `TailoredCvEditor`. `cv-diff.test.ts` covers `diffCv` itself in
 * isolation; this covers what the user actually sees and can click.
 */

const BASELINE: CvDiffSnapshot = {
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: null,
  summary: "Eight years on payment systems.",
  links: [],
  skills: [],
  experience: [
    {
      id: "x-1",
      company: "Stripe",
      role: "Backend Engineer",
      start: "2020-01",
      end: null,
      bullets: [],
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
};

function baselineFormValues(): CvFormValues {
  return { ...BASELINE, phone: "" };
}

function Harness({
  readOnly = false,
  baseline = BASELINE,
  initial,
  adjustments,
}: {
  readOnly?: boolean;
  baseline?: CvDiffSnapshot;
  initial?: CvFormValues;
  adjustments?: TailoredCvAdjustment[];
}) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(tailoredCvSchema),
    defaultValues: initial ?? { ...baseline, phone: baseline.phone ?? "" },
  });
  const cvDiff = useCvDiff({
    form,
    baseline,
    baselineLabel: "Backend CV",
    readOnly,
    adjustments,
  });

  return (
    <TailoredCvEditor
      form={form}
      onSubmit={form.handleSubmit(() => {})}
      baseCvId="1"
      sourceCvName="Backend CV"
      diffSummary={cvDiff.diffSummary}
      diff={cvDiff.slots}
      readOnlyReason={readOnly ? "finalized" : undefined}
    />
  );
}

describe("the diff UI (KODI-017)", () => {
  it("shows the summary bar with no changes until the toggle and an edit", async () => {
    render(<Harness />);
    expect(
      screen.getByText("Compared with Backend CV: no changes"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Changed: Headline")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Show changes"));
    await user.clear(screen.getByLabelText("Headline"));
    await user.type(screen.getByLabelText("Headline"), "Staff Engineer");

    expect(
      await screen.findByText("Compared with Backend CV: 1 change"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Changed: Headline" }),
    ).toBeInTheDocument();
  });

  it("Revert puts the original value back and clears the marker", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Show changes"));

    const headline = screen.getByLabelText("Headline");
    await user.clear(headline);
    await user.type(headline, "Staff Engineer");
    await user.click(
      await screen.findByRole("button", { name: "Changed: Headline" }),
    );
    await user.click(screen.getByRole("button", { name: "Revert Headline" }));

    expect(headline).toHaveValue("Senior Backend Engineer");
    expect(
      screen.queryByRole("button", { name: "Changed: Headline" }),
    ).toBeNull();
    expect(
      screen.getByText("Compared with Backend CV: no changes"),
    ).toBeInTheDocument();
  });

  it("shows an Added badge for a new experience row and a section count", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Show changes"));

    await user.click(screen.getByRole("button", { name: "Add experience" }));
    const row = within(screen.getByRole("group", { name: "experience 2" }));
    expect(row.getByText("Added")).toBeInTheDocument();
    expect(await screen.findByText("1 change")).toBeInTheDocument();
  });

  it("shows a removed experience row with Restore, which brings the row back", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Show changes"));

    await user.click(
      screen.getByRole("button", { name: "Remove experience 1" }),
    );

    const restore = await screen.findByRole("button", {
      name: "Restore experience Backend Engineer",
    });
    expect(
      screen.getByRole("group", { name: /Removed experience/ }),
    ).toBeInTheDocument();

    await user.click(restore);
    expect(
      screen.queryByRole("group", { name: /Removed experience/ }),
    ).toBeNull();
    expect(
      screen.getByRole("group", { name: "experience 1" }),
    ).toBeInTheDocument();
  });

  it("Revert on a LIST-ITEM field puts the original value back on screen, and a later edit does not resurrect the typed one", async () => {
    // Regression: the list sections are one whole-array `Controller`
    // (`cv-form-sections.tsx`); reverting via `setValue` on a NESTED path
    // (`experience.0.role`) updates `getValues()`/`useWatch` but never
    // notifies that Controller, so the ROLE input kept showing the typed
    // value after Revert, and a later edit to a SIBLING field on the same row
    // silently brought the typed value back (`use-cv-diff.tsx`).
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Show changes"));

    const row = within(screen.getByRole("group", { name: "experience 1" }));
    const role = row.getByLabelText("Role");
    await user.clear(role);
    await user.type(role, "Staff Engineer");
    expect(role).toHaveValue("Staff Engineer");

    await user.click(
      row.getByRole("button", { name: "Changed: Role, experience 1" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Revert Role, experience 1" }),
    );
    expect(role).toHaveValue("Backend Engineer");
    expect(
      screen.getByText("Compared with Backend CV: no changes"),
    ).toBeInTheDocument();

    // Editing a SIBLING field on the same row must not resurrect the
    // reverted value — the row has to hold ONE consistent object, not a
    // stale reference the sibling edit accidentally restores.
    const company = row.getByLabelText("Company");
    await user.type(company, "!");
    expect(role).toHaveValue("Backend Engineer");
    expect(
      screen.getByText("Compared with Backend CV: 1 change"),
    ).toBeInTheDocument();
  });

  it("read-only: a removed item shows the row, but never a Restore button", async () => {
    render(
      <Harness
        readOnly
        initial={{ ...baselineFormValues(), experience: [] }}
      />,
    );
    await userEvent.click(screen.getByLabelText("Show changes"));

    expect(
      screen.getByRole("group", { name: /Removed experience/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Restore/ })).toBeNull();
  });

  it("Restore reinserts a removed row at its baseline position among several survivors", async () => {
    const threeRoles: CvDiffSnapshot = {
      ...BASELINE,
      experience: [
        {
          id: "x-1",
          company: "A Co",
          role: "First",
          start: "2018-01",
          end: "2019-01",
          bullets: [],
        },
        {
          id: "x-2",
          company: "B Co",
          role: "Middle",
          start: "2019-01",
          end: "2020-01",
          bullets: [],
        },
        {
          id: "x-3",
          company: "C Co",
          role: "Last",
          start: "2020-01",
          end: null,
          bullets: [],
        },
      ],
    };
    const user = userEvent.setup();
    render(
      <Harness
        baseline={threeRoles}
        initial={{
          ...baselineFormValues(),
          experience: [threeRoles.experience[0], threeRoles.experience[2]],
        }}
      />,
    );
    await user.click(screen.getByLabelText("Show changes"));

    await user.click(
      screen.getByRole("button", { name: "Restore experience Middle" }),
    );

    // Restored BETWEEN "First" and "Last" — its baseline position among the
    // survivors — not appended after "Last".
    const groups = screen.getAllByRole("group", { name: /^experience \d/ });
    const roles = groups.map(
      (g) => (within(g).getByLabelText("Role") as HTMLInputElement).value,
    );
    expect(roles).toEqual(["First", "Middle", "Last"]);
  });

  it("read-only: markers and badges show, but no Revert or Restore", async () => {
    render(
      <Harness
        readOnly
        initial={{
          ...baselineFormValues(),
          headline: "Staff Engineer",
        }}
      />,
    );
    // The toggle itself is not disabled by read-only (it only governs display).
    const toggle = screen.getByLabelText("Show changes");
    await userEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: "Changed: Headline" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Changed: Headline" }),
    );
    expect(
      screen.queryByRole("button", { name: "Revert Headline" }),
    ).toBeNull();
  });
});

describe("keyword-tailoring moves in the comparison (KODI-049, R-025)", () => {
  const ADJUSTMENTS: TailoredCvAdjustment[] = [
    {
      section: "skills",
      description: "Skill categories reordered by job match",
    },
    {
      section: "experience",
      description: "Bullets reordered by job match in 1 role",
    },
  ];

  it("lists the adjustments under 'Reordered by job match' only while Show changes is on", async () => {
    const user = userEvent.setup();
    render(<Harness adjustments={ADJUSTMENTS} />);

    expect(
      screen.queryByRole("list", { name: "Reordered by job match" }),
    ).toBeNull();
    expect(
      screen.queryByText("Skill categories reordered by job match"),
    ).toBeNull();

    await user.click(screen.getByLabelText("Show changes"));
    const list = screen.getByRole("list", { name: "Reordered by job match" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Skill categories reordered by job match",
      "Bullets reordered by job match in 1 role",
    ]);
    // The summary line itself is unchanged.
    expect(
      screen.getByText("Compared with Backend CV: no changes"),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Show changes"));
    expect(
      screen.queryByRole("list", { name: "Reordered by job match" }),
    ).toBeNull();
  });

  it("says 'reordered' on the matching section headers while Show changes is on", async () => {
    const user = userEvent.setup();
    render(<Harness adjustments={ADJUSTMENTS} />);
    expect(screen.queryByText("reordered")).toBeNull();

    await user.click(screen.getByLabelText("Show changes"));
    expect(screen.getAllByText("reordered")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Add experience" }));
    expect(await screen.findByText("1 change, reordered")).toBeInTheDocument();
    expect(screen.getAllByText("reordered")).toHaveLength(1);
  });

  it("renders as before with adjustments: []", async () => {
    const user = userEvent.setup();
    render(<Harness adjustments={[]} />);
    await user.click(screen.getByLabelText("Show changes"));

    expect(
      screen.queryByRole("list", { name: "Reordered by job match" }),
    ).toBeNull();
    expect(screen.queryByText("Reordered by job match")).toBeNull();
    expect(screen.queryByText("reordered")).toBeNull();
    expect(
      screen.getByText("Compared with Backend CV: no changes"),
    ).toBeInTheDocument();
  });
});
