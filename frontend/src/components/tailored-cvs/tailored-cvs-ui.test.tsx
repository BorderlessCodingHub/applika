import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { CvFormValues } from "@/components/base-cvs/types";
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
    skills: ["Python"],
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
    expect(screen.getByRole("status")).toHaveTextContent("finalized");
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
