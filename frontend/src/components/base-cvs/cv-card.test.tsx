import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BaseCvList } from "./base-cv-list";
import { CvCard } from "./cv-card";
import {
  CV_PDF_EXPORT_LABEL,
  CV_PDF_EXPORT_PENDING,
  CV_PDF_LAYOUT_NOTICE,
  skillCategoryKeywords,
  skillKeywordCount,
  type BaseCv,
  type CvSkillCategory,
} from "./types";

/**
 * The `/cvs` gallery tile (KODI-009 / AC1, AC2).
 *
 * The owner: "instead of listing the keywords, now lists only the categories,
 * change this to display all keywords inside all categories in skills and add
 * a button to download the CV".
 *
 * Two properties are pinned here:
 *
 * - AC1 — EVERY keyword of EVERY category is on the tile, attributed to the
 *   category it belongs to. Nothing is capped, clipped or counted away: a
 *   hidden "+7" is the exact behaviour the owner asked us to remove, so the
 *   worst case (many categories, many keywords) is asserted keyword by
 *   keyword.
 * - AC2 — every tile carries its own download, named after its own CV, and the
 *   busy state lands on the tile whose render is actually in flight.
 *
 * The words are asserted, never the classes.
 */

const SKILLS: CvSkillCategory[] = [
  {
    id: "s-1",
    category: "Languages and frameworks",
    keywords: ["Python", "TypeScript", "FastAPI", "React"],
  },
  { id: "s-2", category: "Data stores", keywords: ["PostgreSQL", "Redis"] },
  { id: "s-3", category: "Platform", keywords: ["Docker", "Kubernetes"] },
  { id: "s-4", category: "Practices", keywords: ["TDD", "Trunk-based"] },
  { id: "s-5", category: "Cloud", keywords: ["AWS", "Terraform"] },
];

function cv(over: Partial<BaseCv> = {}): BaseCv {
  return {
    id: "1",
    name: "Backend CV",
    full_name: "Ada Lovelace",
    headline: "Senior Backend Engineer",
    location: "London",
    email: "ada@example.com",
    phone: null,
    summary: "Eight years on payment systems.",
    links: [],
    skills: SKILLS,
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    languages: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
    ...over,
  };
}

describe("the tile's skills (AC1)", () => {
  it("prints every keyword of every category, none of them capped away", () => {
    render(<CvCard cv={cv()} href="/cvs/editor?id=1" onDelete={vi.fn()} />);

    for (const category of SKILLS) {
      // The category is a label the user can see...
      expect(screen.getByText(category.category)).toBeVisible();
      for (const keyword of category.keywords) {
        // ...and every keyword under it is really on the tile, attributed to
        // it rather than floating in one flat run.
        const line = screen.getByText(category.category).closest("div");
        expect(line).not.toBeNull();
        expect(line).toHaveTextContent(keyword);
      }
    }
    // 5 categories, 12 keywords: nothing was dropped on the way.
    expect(skillCategoryKeywords(SKILLS)).toHaveLength(5);
    expect(skillKeywordCount(SKILLS)).toBe(12);
  });

  it("counts the keywords, not just the categories", () => {
    render(<CvCard cv={cv()} href="/cvs/editor?id=1" onDelete={vi.fn()} />);

    expect(screen.getByText(/12 keywords/)).toBeVisible();
  });

  it("keeps a category whose keywords are still empty", () => {
    render(
      <CvCard
        cv={cv({ skills: [{ id: "s-1", category: "Tooling", keywords: [] }] })}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Tooling")).toBeVisible();
    expect(screen.getByText(/0 keywords/)).toBeVisible();
    // A `dt` with no `dd` after it is not a valid description list, so the
    // description is rendered empty rather than dropped.
    const term = screen.getByText("Tooling");
    expect(term.tagName).toBe("DT");
    expect(term.nextElementSibling?.tagName).toBe("DD");
  });

  it("says so plainly when there are no skills at all", () => {
    render(
      <CvCard
        cv={cv({ skills: [] })}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("No skills added yet")).toBeVisible();
  });
});

describe("the tile's download (AC2)", () => {
  it("names the CV in the download's accessible name", () => {
    render(
      <CvCard
        cv={cv({ name: "Data CV" })}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: `${CV_PDF_EXPORT_LABEL} Data CV`,
    });
    // The visible text is still the plain label, so the accessible name starts
    // with what the user reads (WCAG 2.5.3).
    expect(button).toHaveTextContent(CV_PDF_EXPORT_LABEL);
  });

  it("still carries the preview-is-not-the-PDF words on the compact tile", () => {
    render(
      <CvCard
        cv={cv()}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    // Not painted on a tile that shows no preview, but in the DOM and tied to
    // the button — the notice never leaves the export.
    expect(
      screen.getByRole("button", {
        name: `${CV_PDF_EXPORT_LABEL} Backend CV`,
      }),
    ).toHaveAccessibleDescription(CV_PDF_LAYOUT_NOTICE);
    expect(screen.getByText(CV_PDF_LAYOUT_NOTICE)).toBeInTheDocument();
  });

  it("asks the parent for this CV's PDF, and nothing else", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const onDelete = vi.fn();
    render(
      <CvCard
        cv={cv()}
        href="/cvs/editor?id=1"
        onDelete={onDelete}
        onExport={onExport}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: `${CV_PDF_EXPORT_LABEL} Backend CV` }),
    );

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("offers edit and delete beside the download, all three at once", () => {
    render(
      <CvCard
        cv={cv()}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: `${CV_PDF_EXPORT_LABEL} Backend CV` }),
    ).toBeEnabled();
    expect(screen.getByRole("link", { name: "Edit Backend CV" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete Backend CV" }),
    ).toBeVisible();
  });
});

describe("the gallery's downloads (AC2)", () => {
  const CVS = [
    cv({ id: "1", name: "Backend CV" }),
    cv({ id: "2", name: "Data CV", skills: [] }),
  ];

  function renderList(over: Partial<Parameters<typeof BaseCvList>[0]> = {}) {
    return render(
      <BaseCvList
        cvs={CVS}
        editHref={(item) => `/cvs/editor?id=${item.id}`}
        newHref="/cvs/new"
        onDelete={vi.fn()}
        onExport={vi.fn()}
        {...over}
      />,
    );
  }

  it("gives every tile a download of its own CV", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: `${CV_PDF_EXPORT_LABEL} Backend CV` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${CV_PDF_EXPORT_LABEL} Data CV` }),
    ).toBeInTheDocument();
  });

  it("hands the pressed CV back, not the first one", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderList({ onExport });

    await user.click(
      screen.getByRole("button", { name: `${CV_PDF_EXPORT_LABEL} Data CV` }),
    );

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0][0]).toMatchObject({ id: "2" });
  });

  it("puts the busy state on the tile whose render is in flight, and only it", () => {
    renderList({ exportingId: "2" });

    const busy = screen.getByRole("button", {
      name: `${CV_PDF_EXPORT_LABEL} Data CV`,
    });
    const idle = screen.getByRole("button", {
      name: `${CV_PDF_EXPORT_LABEL} Backend CV`,
    });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(idle).toBeEnabled();
    // The pending announcement belongs to the busy tile alone.
    expect(screen.getAllByText(CV_PDF_EXPORT_PENDING)).toHaveLength(1);
  });

  it("renders no download at all on a surface that cannot export", () => {
    renderList({ onExport: undefined });

    expect(
      screen.queryByRole("button", { name: /Download PDF/ }),
    ).not.toBeInTheDocument();
    // The rest of the tile is untouched.
    expect(screen.getByRole("link", { name: "Edit Backend CV" })).toBeVisible();
  });

  it("keeps every keyword of every CV in the gallery, not only the first", () => {
    renderList({ cvs: [cv({ id: "1" }), cv({ id: "2", name: "Data CV" })] });

    // Two tiles, five categories each: every one of the twelve keywords twice.
    expect(screen.getAllByText("Languages and frameworks")).toHaveLength(2);
    for (const keyword of ["Python", "PostgreSQL", "Kubernetes", "Terraform"]) {
      expect(
        screen.getAllByText(new RegExp(keyword), { exact: false }).length,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
