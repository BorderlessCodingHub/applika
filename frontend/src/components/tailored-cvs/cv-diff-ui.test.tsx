import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { CvFormValues } from "@/components/base-cvs/types";
import type { CvDiffSnapshot } from "./cv-diff";
import { TailoredCvEditor } from "./tailored-cv-editor";
import { tailoredCvSchema } from "./tailored-cv-schema";
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
  initial = baselineFormValues(),
}: {
  readOnly?: boolean;
  initial?: CvFormValues;
}) {
  const form = useForm<CvFormValues>({
    resolver: zodResolver(tailoredCvSchema),
    defaultValues: initial,
  });
  const cvDiff = useCvDiff({
    form,
    baseline: BASELINE,
    baselineLabel: "Backend CV",
    readOnly,
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
