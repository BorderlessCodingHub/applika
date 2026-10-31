import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BaseCvList } from "./base-cv-list";
import { CvCard } from "./cv-card";
import {
  skillKeywords,
  type BaseCv,
  type CvSkillCategory,
  CV_EXPORT_COPY,
} from "./types";

/**
 * The `/cvs` gallery tile (KODI-009 / AC1, AC2).
 *
 * The owner, round 3: "what you did was listing every skill categoty and put
 * all keywords in plain text, THIS WHAT NOT WHAT I SAID, i said to display all
 * keywords of all categories but still in badges as was in the first place
 * (but do not display skills repetedly)".
 *
 * Two properties are pinned here:
 *
 * - AC1 — EVERY keyword of EVERY category is on the tile, as a BADGE, in one
 *   flat row with no category labels. Nothing is capped, clipped or counted
 *   away: a hidden "+7" is the exact behaviour the owner asked us to remove,
 *   so the worst case (many categories, many keywords) is asserted keyword by
 *   keyword. A keyword that appears twice renders ONCE — trimmed, compared
 *   case-insensitively, first casing wins.
 * - AC2 — every tile carries its own download, named after its own CV, and the
 *   busy state lands on the tile whose render is actually in flight.
 *
 * The words and `data-slot="badge"` are asserted, never the classes.
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

/** Every badge on the tile, in DOM order, by the words inside it. */
function badgeTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="badge"]')).map(
    (badge) => badge.textContent ?? "",
  );
}

describe("the tile's skills (AC1)", () => {
  it("prints every keyword of every category as a badge, none of them capped", () => {
    const { container } = render(
      <CvCard cv={cv()} href="/cvs/editor?id=1" onDelete={vi.fn()} />,
    );

    const badges = badgeTexts(container);
    // 5 categories, 12 keywords, all of them flattened into one badge row.
    expect(badges).toEqual([
      "Python",
      "TypeScript",
      "FastAPI",
      "React",
      "PostgreSQL",
      "Redis",
      "Docker",
      "Kubernetes",
      "TDD",
      "Trunk-based",
      "AWS",
      "Terraform",
    ]);
    for (const category of SKILLS) {
      for (const keyword of category.keywords) {
        // Really on screen, not merely in the DOM.
        expect(screen.getByText(keyword)).toBeVisible();
      }
    }
    // No overflow counter came back with the badges.
    expect(screen.queryByText(/^\+\d+/)).not.toBeInTheDocument();
  });

  it("drops the category names from the tile: badges only", () => {
    render(<CvCard cv={cv()} href="/cvs/editor?id=1" onDelete={vi.fn()} />);

    for (const category of SKILLS) {
      expect(screen.queryByText(category.category)).not.toBeInTheDocument();
    }
    // And the plain-text treatment the owner rejected is gone with them.
    expect(document.querySelector("dl")).toBeNull();
  });

  it("renders a keyword shared by two categories exactly once", () => {
    const { container } = render(
      <CvCard
        cv={{
          ...cv(),
          skills: [
            { id: "s-1", category: "Backend", keywords: ["Python", "Redis"] },
            { id: "s-2", category: "Data", keywords: ["Python", "dbt"] },
          ],
        }}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    expect(badgeTexts(container)).toEqual(["Python", "Redis", "dbt"]);
    // `getByText` is singular on purpose: two badges would throw here.
    expect(screen.getByText("Python")).toBeVisible();
  });

  it("treats casing and surrounding whitespace as the same skill, first casing winning", () => {
    const { container } = render(
      <CvCard
        cv={{
          ...cv(),
          skills: [
            { id: "s-1", category: "Backend", keywords: ["Python", "  "] },
            {
              id: "s-2",
              category: "Data",
              keywords: ["  python  ", "PYTHON", " Redis "],
            },
          ],
        }}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    // One badge for Python, spelled the way its FIRST occurrence was typed,
    // and the padded "Redis" is trimmed rather than badged with its spaces.
    expect(badgeTexts(container)).toEqual(["Python", "Redis"]);
    expect(screen.queryByText("PYTHON")).not.toBeInTheDocument();
  });

  it("counts the keywords the user can see, after the duplicates are gone", () => {
    render(
      <CvCard
        cv={{
          ...cv(),
          skills: [
            { id: "s-1", category: "Backend", keywords: ["Python", "Redis"] },
            { id: "s-2", category: "Data", keywords: ["python", "dbt"] },
          ],
        }}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    // Four keywords were typed; three are on screen, so the line says three.
    expect(screen.getByText(/3 keywords/)).toBeVisible();
    expect(screen.queryByText(/4 keywords/)).not.toBeInTheDocument();
  });

  it("counts every keyword when none of them repeat", () => {
    render(<CvCard cv={cv()} href="/cvs/editor?id=1" onDelete={vi.fn()} />);

    expect(screen.getByText(/12 keywords/)).toBeVisible();
  });

  it("says one keyword in the singular", () => {
    render(
      <CvCard
        cv={cv({
          skills: [{ id: "s-1", category: "Tooling", keywords: ["Make"] }],
        })}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 keyword(?!s)/)).toBeVisible();
  });

  it("shows the empty state for a category that has no keywords yet", () => {
    render(
      <CvCard
        cv={cv({ skills: [{ id: "s-1", category: "Tooling", keywords: [] }] })}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    // The category is a heading of the DOCUMENT, not of this tile, so an empty
    // one leaves the tile with nothing to badge.
    expect(screen.getByText("No skills added yet")).toBeVisible();
    expect(screen.getByText(/0 keywords/)).toBeVisible();
    expect(screen.queryByText("Tooling")).not.toBeInTheDocument();
  });

  it("wraps a keyword too wide for the tile instead of clipping its tail", () => {
    // 100 characters is a SAVEABLE keyword (`BASE_CV_MAX.skillKeyword`), and
    // it is wider than the tile. The registry Badge is `whitespace-nowrap`, so
    // the card has to opt out or the shell's `overflow-hidden` eats the tail —
    // silent truncation, which is the whole thing this card exists to stop.
    const long = "a".repeat(100);
    const { container } = render(
      <CvCard
        cv={cv({
          skills: [{ id: "s-1", category: "Tooling", keywords: [long] }],
        })}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
      />,
    );

    // The whole keyword is there, and the badge is allowed to wrap and to stay
    // inside its row. jsdom computes no layout, so the opt-out is asserted on
    // the element rather than measured; the real geometry is pinned in
    // `e2e/cv-builder.spec.ts`.
    expect(badgeTexts(container)).toEqual([long]);
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge).toHaveClass("whitespace-normal");
    expect(badge).toHaveClass("max-w-full");
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

describe("skillKeywords", () => {
  it("flattens the categories in print order", () => {
    expect(skillKeywords(SKILLS)).toEqual([
      "Python",
      "TypeScript",
      "FastAPI",
      "React",
      "PostgreSQL",
      "Redis",
      "Docker",
      "Kubernetes",
      "TDD",
      "Trunk-based",
      "AWS",
      "Terraform",
    ]);
  });

  it("keeps the first occurrence's casing and drops the later spellings", () => {
    expect(
      skillKeywords([
        { id: "a", category: "One", keywords: ["Go", "gRPC"] },
        { id: "b", category: "Two", keywords: ["GO", " go ", "GRPC"] },
      ]),
    ).toEqual(["Go", "gRPC"]);
  });

  it("drops blank and whitespace-only keywords", () => {
    expect(
      skillKeywords([
        { id: "a", category: "One", keywords: ["", "   ", "Go"] },
      ]),
    ).toEqual(["Go"]);
  });

  it("keeps a keyword whose category has no name", () => {
    // The tile shows no category label, so there is no reason to hide the
    // skill the user actually typed.
    expect(
      skillKeywords([{ id: "a", category: "  ", keywords: ["Nix"] }]),
    ).toEqual(["Nix"]);
  });

  it("is empty for a CV with no skills", () => {
    expect(skillKeywords([])).toEqual([]);
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
      name: `${CV_EXPORT_COPY.pdfLabel} Data CV`,
    });
    // The visible text is still the plain label, so the accessible name starts
    // with what the user reads (WCAG 2.5.3).
    expect(button).toHaveTextContent(CV_EXPORT_COPY.pdfLabel);
  });

  it("says nothing about a preview it does not render", () => {
    render(
      <CvCard
        cv={cv()}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    // The tile renders NO preview, so the preview-is-not-the-PDF notice
    // describes nothing here. It used to reach the tile `sr-only` through the
    // export button's `aria-describedby`, which meant a screen reader heard it
    // once per tile — up to three times on `/cvs` — about a document the page
    // never shows, while a sighted user never saw it at all. Gone from the
    // DOM, and gone from the button's description: the download stands alone.
    expect(screen.queryByText(CV_EXPORT_COPY.layoutNotice)).toBeNull();
    expect(
      screen.getByRole("button", {
        name: `${CV_EXPORT_COPY.pdfLabel} Backend CV`,
      }),
    ).not.toHaveAccessibleDescription(CV_EXPORT_COPY.layoutNotice);
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
      screen.getByRole("button", {
        name: `${CV_EXPORT_COPY.pdfLabel} Backend CV`,
      }),
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
      screen.getByRole("button", {
        name: `${CV_EXPORT_COPY.pdfLabel} Backend CV`,
      }),
    ).toBeEnabled();
    expect(screen.getByRole("link", { name: "Edit Backend CV" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete Backend CV" }),
    ).toBeVisible();
  });
});

describe("the tile's Markdown download (KODI-017 part 3)", () => {
  it("renders no Markdown button without `onExportMarkdown`", () => {
    render(
      <CvCard
        cv={cv()}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: new RegExp(CV_EXPORT_COPY.markdownLabel),
      }),
    ).toBeNull();
  });

  it("asks the parent for this CV's Markdown, beside the PDF", async () => {
    const user = userEvent.setup();
    const onExportMarkdown = vi.fn();
    render(
      <CvCard
        cv={cv()}
        href="/cvs/editor?id=1"
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onExportMarkdown={onExportMarkdown}
      />,
    );

    const markdownButton = screen.getByRole("button", {
      name: `${CV_EXPORT_COPY.markdownLabel} Backend CV`,
    });
    const pdfButton = screen.getByRole("button", {
      name: `${CV_EXPORT_COPY.pdfLabel} Backend CV`,
    });
    expect(markdownButton).toBeEnabled();
    expect(pdfButton).toBeEnabled();

    await user.click(markdownButton);
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
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
      screen.getByRole("button", {
        name: `${CV_EXPORT_COPY.pdfLabel} Backend CV`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `${CV_EXPORT_COPY.pdfLabel} Data CV`,
      }),
    ).toBeInTheDocument();
  });

  it("hands the pressed CV back, not the first one", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderList({ onExport });

    await user.click(
      screen.getByRole("button", {
        name: `${CV_EXPORT_COPY.pdfLabel} Data CV`,
      }),
    );

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0][0]).toMatchObject({ id: "2" });
  });

  it("puts the busy state on the tile whose render is in flight, and only it", () => {
    renderList({ exportingId: "2" });

    const busy = screen.getByRole("button", {
      name: `${CV_EXPORT_COPY.pdfLabel} Data CV`,
    });
    const idle = screen.getByRole("button", {
      name: `${CV_EXPORT_COPY.pdfLabel} Backend CV`,
    });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(idle).toBeEnabled();
    // The pending announcement belongs to the busy tile alone.
    expect(screen.getAllByText(CV_EXPORT_COPY.pdfPending)).toHaveLength(1);
  });

  it("hands the Markdown export through to the right tile, distinct from the PDF one", async () => {
    const user = userEvent.setup();
    const onExportMarkdown = vi.fn();
    renderList({ onExportMarkdown, exportingMarkdownId: "1" });

    const busyMarkdown = screen.getByRole("button", {
      name: `${CV_EXPORT_COPY.markdownLabel} Backend CV`,
    });
    const idleMarkdown = screen.getByRole("button", {
      name: `${CV_EXPORT_COPY.markdownLabel} Data CV`,
    });
    expect(busyMarkdown).toBeDisabled();
    expect(idleMarkdown).toBeEnabled();

    await user.click(idleMarkdown);
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
    expect(onExportMarkdown.mock.calls[0][0]).toMatchObject({ id: "2" });
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
    const { container } = renderList({
      cvs: [cv({ id: "1" }), cv({ id: "2", name: "Data CV" })],
    });

    // Two tiles, twelve keywords each: 24 badges, deduplicated PER TILE and
    // never across the gallery.
    expect(badgeTexts(container)).toHaveLength(24);
    for (const keyword of ["Python", "PostgreSQL", "Kubernetes", "Terraform"]) {
      expect(screen.getAllByText(keyword)).toHaveLength(2);
    }
  });
});

describe("the tile's updated date", () => {
  it("is written the English way in English, whatever the browser's own locale", () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleDateString");
    try {
      render(
        <CvCard
          cv={cv({ updated_at: "2026-10-20T10:00:00Z" })}
          href="/cvs/editor?id=1"
          onDelete={vi.fn()}
        />,
      );

      expect(spy).toHaveBeenCalled();
      // `undefined` would hand the style to the browser's locale.
      for (const [locale] of spy.mock.calls) expect(locale).toBe("en");
      expect(screen.getByText(/^Updated Oct 20, 2026$/)).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
