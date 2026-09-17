import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CV_KEYWORDS_HINT } from "./cv-keywords-input";
import { CV_SKILLS_EMPTY_HINT, CvSkillsSection } from "./cv-skills-section";
import type { CvSkillCategory } from "./types";

/**
 * The categorised skills editor (KODI-006 / AC3).
 *
 * The owner: "skills isn't simply a section where i put "tags" or just
 * "keywords" it's a section where i can create a category and inside this
 * caregory add keywords". So the editor is a list of NAMED categories, each
 * owning its own keyword list, and both levels are add / rename / reorder /
 * remove.
 *
 * Keyword order is part of the CV and a wrapping chip row has no room for a
 * pair of move buttons per chip, so the move is keyboard-operable. That is
 * asserted here rather than assumed.
 */

/** A controlled host, so the assertions see what the user would see. */
function Harness({ initial = [] }: { initial?: CvSkillCategory[] }) {
  const [value, setValue] = useState<CvSkillCategory[]>(initial);
  let n = 0;
  return (
    <CvSkillsSection
      value={value}
      onChange={setValue}
      newItemId={() => `s-${++n}`}
    />
  );
}

const SEEDED: CvSkillCategory[] = [
  {
    id: "s-1",
    category: "Languages and frameworks",
    keywords: ["Python", "TypeScript", "Go"],
  },
  { id: "s-2", category: "Data stores", keywords: ["PostgreSQL"] },
];

/** The keyword chips of one category, in print order. */
function chips(category: string): string[] {
  return within(screen.getByRole("list", { name: `Keywords in ${category}` }))
    .getAllByRole("button", { name: /^Rename / })
    .map((chip) => chip.textContent ?? "");
}

/** The category captions, in print order. */
function categories(): string[] {
  return screen
    .getAllByRole("group", { name: /^category \d+$/ })
    .map((row) => within(row).getByLabelText("Category").getAttribute("value"))
    .filter((name): name is string => name !== null);
}

describe("CvSkillsSection — the categories", () => {
  it("starts empty and says what a category is for", () => {
    render(<Harness />);

    expect(screen.getByText(CV_SKILLS_EMPTY_HINT)).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "category 1" }),
    ).not.toBeInTheDocument();
  });

  it("adds a category and names it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add category" }));
    const row = within(screen.getByRole("group", { name: "category 1" }));
    await user.type(row.getByLabelText("Category"), "Testing and QA");

    expect(row.getByLabelText("Category")).toHaveValue("Testing and QA");
    // The caption follows the name, so a long list stays readable.
    expect(screen.getByText("Testing and QA")).toBeInTheDocument();
  });

  it("renames a category in place", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SEEDED} />);

    const field = within(
      screen.getByRole("group", { name: "category 2" }),
    ).getByLabelText("Category");
    await user.clear(field);
    await user.type(field, "Databases");

    expect(categories()).toEqual(["Languages and frameworks", "Databases"]);
  });

  it("reorders the categories, because the print order is the list order", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SEEDED} />);

    await user.click(
      screen.getByRole("button", { name: "Move category 2 up" }),
    );

    expect(categories()).toEqual(["Data stores", "Languages and frameworks"]);
    // The keywords travel with their category, never with the row position.
    expect(chips("Data stores")).toEqual(["PostgreSQL"]);
  });

  it("removes a category and everything inside it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SEEDED} />);

    await user.click(screen.getByRole("button", { name: "Remove category 1" }));

    expect(categories()).toEqual(["Data stores"]);
    expect(
      screen.queryByRole("list", {
        name: "Keywords in Languages and frameworks",
      }),
    ).not.toBeInTheDocument();
  });
});

describe("CvSkillsSection — the keywords inside a category", () => {
  it("names the entry after its category, so several on screen stay apart", () => {
    render(<Harness initial={SEEDED} />);

    expect(
      screen.getByLabelText("Add a keyword to Languages and frameworks"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Add a keyword to Data stores"),
    ).toBeInTheDocument();
  });

  it("adds a keyword on Enter and on a comma", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[{ id: "s-1", category: "Cloud", keywords: [] }]} />,
    );

    const entry = screen.getByLabelText("Add a keyword to Cloud");
    await user.type(entry, "Terraform{Enter}");
    await user.type(entry, "Docker,");

    expect(chips("Cloud")).toEqual(["Terraform", "Docker"]);
    expect(entry).toHaveValue("");
  });

  it("splits a pasted list and drops case-insensitive duplicates", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[{ id: "s-1", category: "Cloud", keywords: [] }]} />,
    );

    const entry = screen.getByLabelText("Add a keyword to Cloud");
    await user.click(entry);
    await user.paste("Docker, Kubernetes, docker,  , Terraform");

    expect(chips("Cloud")).toEqual(["Docker", "Kubernetes", "Terraform"]);
  });

  it("commits what is still in the entry on blur", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[{ id: "s-1", category: "Cloud", keywords: [] }]} />,
    );

    await user.type(screen.getByLabelText("Add a keyword to Cloud"), "Pulumi");
    await user.tab();

    expect(chips("Cloud")).toEqual(["Pulumi"]);
  });

  it("renames a keyword in place, and Escape abandons the rename", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SEEDED} />);

    await user.click(screen.getByRole("button", { name: "Rename TypeScript" }));
    const editor = screen.getByLabelText("Rename TypeScript");
    await user.clear(editor);
    await user.type(editor, "Rust{Enter}");

    expect(chips("Languages and frameworks")).toEqual(["Python", "Rust", "Go"]);

    await user.click(screen.getByRole("button", { name: "Rename Rust" }));
    await user.type(screen.getByLabelText("Rename Rust"), "Zig{Escape}");

    expect(chips("Languages and frameworks")).toEqual(["Python", "Rust", "Go"]);
  });

  it("moves a keyword with Alt and an arrow key", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SEEDED} />);

    const chip = screen.getByRole("button", { name: "Rename Python" });
    chip.focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");

    expect(chips("Languages and frameworks")).toEqual([
      "TypeScript",
      "Python",
      "Go",
    ]);
  });

  it("tells the reorder keys on the field and on every chip", async () => {
    render(<Harness initial={SEEDED} />);

    // The keys are told once in words under the field, and carried per chip
    // for a screen reader, because there are no per-chip move buttons.
    expect(screen.getAllByText(CV_KEYWORDS_HINT).length).toBeGreaterThan(0);
    expect(CV_KEYWORDS_HINT).toContain("Alt");
    expect(
      screen.getByRole("button", { name: "Rename Python" }),
    ).toHaveAttribute("aria-keyshortcuts");
  });

  it("removes a keyword by its own button and by Delete", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SEEDED} />);

    await user.click(screen.getByRole("button", { name: "Remove Go" }));
    expect(chips("Languages and frameworks")).toEqual(["Python", "TypeScript"]);

    screen.getByRole("button", { name: "Rename Python" }).focus();
    await user.keyboard("{Delete}");
    expect(chips("Languages and frameworks")).toEqual(["TypeScript"]);
  });

  it("removes the last keyword on Backspace in an empty entry", async () => {
    const user = userEvent.setup();
    render(<Harness initial={SEEDED} />);

    await user.click(
      screen.getByLabelText("Add a keyword to Languages and frameworks"),
    );
    await user.keyboard("{Backspace}");

    expect(chips("Languages and frameworks")).toEqual(["Python", "TypeScript"]);
  });
});
