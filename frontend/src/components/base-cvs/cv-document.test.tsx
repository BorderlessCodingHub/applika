import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CV_DOCUMENT_SECTIONS,
  CV_EDUCATION_DEGREE_JOINER,
  CV_KEYWORD_SEPARATOR,
  CvDocument,
  educationDegreeLine,
  getPopulatedCvSections,
  skillCategoryHeading,
  visibleEducation,
  visibleSkillCategories,
  type CvDocumentData,
} from "./cv-document";

/**
 * The live preview, against the owner's template (KODI-006).
 *
 * The owner reviewed the built feature on a real stack and named what was
 * wrong. Every assertion here is one of his sentences:
 *
 *  - AC2 — "Summary MUST BE ON TOP, followed by experience, languages, skills,
 *    projects (optionally), education and certifications (optionally)";
 *  - AC3 — "skills isn't simply a section where i put "tags" or just
 *    "keywords" it's a section where i can create a category and inside this
 *    caregory add keywords";
 *  - AC4 — "I never said to cut out education, only key achievements";
 *  - AC5 — "One line displaying the project name, the second like the link to
 *    access this project with the current behavior if link label is missing,
 *    just display the raw link and in a third link the project description";
 *  - AC6 — "the languages is alignes to the center when I have only one
 *    languages or two … fix the live preview to align to the left as well and
 *    remove the dots in live preview only display the language name and the
 *    level".
 *
 * The preview and the server's PDF are two renderers of ONE document, so the
 * separator, the category colon, the three-line project and the degree joiner
 * are pinned here against `cv_rendering/mapper.py`.
 */

/** A CV with something in every section. Invented, like every fixture here. */
const FULL_CV: CvDocumentData = {
  name: "Backend CV",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London, United Kingdom",
  email: "ada@example.com",
  phone: "+44 20 7946 0958",
  summary: "Backend engineer with eight years on payment systems.",
  links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
  skills: [
    {
      id: "s-1",
      category: "Languages and frameworks",
      keywords: ["Python", "TypeScript", "Go"],
    },
    { id: "s-2", category: "Data stores", keywords: ["PostgreSQL", "Redis"] },
  ],
  experience: [
    {
      id: "e-1",
      company: "Northwind Payments",
      role: "Senior Backend Engineer",
      period: "2021 — Present",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [
    {
      id: "p-1",
      name: "difference-engine",
      description: "A mechanical computer, in Rust.",
      link: "https://example.com/difference-engine",
      link_label: "Live demo",
    },
  ],
  education: [
    {
      id: "d-1",
      institution: "University of Edinburgh",
      degree: "BSc",
      area: "Computer Science",
      period: "2010 — 2013",
    },
  ],
  certifications: [
    { id: "c-1", name: "AWS SAA", issuer: "Amazon Web Services" },
  ],
  languages: [{ id: "g-1", name: "English", level: "Native" }],
};

function cv(over: Partial<CvDocumentData> = {}): CvDocumentData {
  return { ...FULL_CV, ...over };
}

/** The document's own section, by its uppercase heading. */
function documentSection(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name: title });
  const section = heading.closest("section");
  if (!section) throw new Error(`no section around the ${title} heading`);
  return section;
}

describe("the owner's section order", () => {
  it("is summary, experience, languages, skills, projects, education, certifications", () => {
    // The order the owner dictated, and the order `SECTION_ORDER` in
    // `cv_rendering/mapper.py` typesets. The first cut printed them
    // alphabetically, with the summary at the bottom.
    expect(CV_DOCUMENT_SECTIONS).toEqual([
      "summary",
      "experience",
      "languages",
      "skills",
      "projects",
      "education",
      "certifications",
    ]);
    expect(getPopulatedCvSections(FULL_CV)).toEqual([
      "summary",
      "experience",
      "languages",
      "skills",
      "projects",
      "education",
      "certifications",
    ]);
  });

  it("keeps that order no matter how the data is shaped", () => {
    // A CV with only the optional tail still prints projects before education
    // before certifications.
    expect(
      getPopulatedCvSections(
        cv({ summary: "", experience: [], languages: [], skills: [] }),
      ),
    ).toEqual(["projects", "education", "certifications"]);
  });

  it("omits a section that has nothing in it", () => {
    expect(
      getPopulatedCvSections(
        cv({ projects: [], education: [], certifications: [] }),
      ),
    ).toEqual(["summary", "experience", "languages", "skills"]);
    expect(getPopulatedCvSections(cv({ summary: "   " }))).not.toContain(
      "summary",
    );
  });

  it("renders the headings in that order too", () => {
    render(<CvDocument cv={FULL_CV} />);

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Summary",
      "Experience",
      "Languages",
      "Skills",
      "Projects",
      "Education",
      "Certifications",
    ]);
  });
});

describe("skillCategoryHeading (AC3)", () => {
  it("closes a category with a colon", () => {
    expect(skillCategoryHeading("Languages and frameworks")).toBe(
      "Languages and frameworks:",
    );
  });

  it("does not double a colon the user already typed", () => {
    // The owner typed the colon into his own category names by hand; a user
    // who does the same must not get "Testing & QA::".
    expect(skillCategoryHeading("Testing and QA:")).toBe("Testing and QA:");
  });

  it("trims, and gives a blank category no colon at all", () => {
    // Parity with the server's `_skill_category_label`, which returns the
    // empty string rather than a lone ":".
    expect(skillCategoryHeading("  DevOps  ")).toBe("DevOps:");
    expect(skillCategoryHeading("   ")).toBe("");
  });
});

describe("the skills section (AC3)", () => {
  it("joins keywords with a middle dot, not a bullet and not a comma", () => {
    // U+00B7 with a space each side — the same constant the server's
    // `SKILLS_SEPARATOR` uses. U+2022 is the contact line's glyph.
    expect(CV_KEYWORD_SEPARATOR).toBe(" · ");
    expect(CV_KEYWORD_SEPARATOR).not.toContain("•");
  });

  it("prints one block per category: the name, then its keywords", () => {
    render(<CvDocument cv={FULL_CV} />);
    const skills = within(documentSection("Skills"));

    expect(skills.getByText("Languages and frameworks:")).toBeInTheDocument();
    expect(skills.getByText("Python · TypeScript · Go")).toBeInTheDocument();
    expect(skills.getByText("Data stores:")).toBeInTheDocument();
    expect(skills.getByText("PostgreSQL · Redis")).toBeInTheDocument();
  });

  it("is not a flat tag list: the keywords never leave their category", () => {
    render(<CvDocument cv={FULL_CV} />);
    const skills = documentSection("Skills");

    // Each category heading and its keyword line share one block, and there
    // are exactly as many blocks as categories.
    expect(skills.textContent).toContain(
      "Languages and frameworks:Python · TypeScript · Go",
    );
    expect(skills.textContent).toContain("Data stores:PostgreSQL · Redis");
  });

  it("keeps a named category that has no keywords yet", () => {
    // The server's `_skill_entries` emits its heading too; the preview must
    // not drop a line the PDF prints.
    const only = [{ id: "s-9", category: "Monitoring", keywords: [] }];
    expect(visibleSkillCategories(only)).toHaveLength(1);

    render(<CvDocument cv={cv({ skills: only })} />);
    expect(
      within(documentSection("Skills")).getByText("Monitoring:"),
    ).toBeInTheDocument();
  });

  it("drops a category with neither a name nor a keyword", () => {
    expect(
      visibleSkillCategories([{ id: "s-9", category: "  ", keywords: [] }]),
    ).toEqual([]);
    expect(
      getPopulatedCvSections(
        cv({ skills: [{ id: "s-9", category: " ", keywords: [] }] }),
      ),
    ).not.toContain("skills");
  });
});

describe("the languages section (AC6)", () => {
  it("shows the name and the level, and nothing else", () => {
    render(<CvDocument cv={FULL_CV} />);
    const languages = documentSection("Languages");

    expect(languages.textContent).toBe("LanguagesEnglishNative");
  });

  it("prints no separator dot of any kind", () => {
    // "remove the dots in live preview only display the language name and the
    // level" — neither U+00B7 nor U+2022 nor a filled proficiency meter.
    render(
      <CvDocument
        cv={cv({
          languages: [
            { id: "g-1", name: "English", level: "Native" },
            { id: "g-2", name: "Portuguese", level: "Conversational" },
          ],
        })}
      />,
    );
    const languages = documentSection("Languages");

    expect(languages.textContent).not.toContain("·");
    expect(languages.textContent).not.toContain("•");
    // The old meter was a run of decorative spans per row.
    expect(languages.querySelectorAll("[aria-hidden]")).toHaveLength(0);
  });

  it("sits hard left at one language and at two, by structure", () => {
    // The old row was `justify-around`, which centres one or two entries and
    // is exactly what the owner saw. A three-column grid fills from the left
    // at any count, so there is no count to tune.
    for (const count of [1, 2, 3]) {
      const { unmount } = render(
        <CvDocument
          cv={cv({
            languages: Array.from({ length: count }, (_, i) => ({
              id: `g-${i}`,
              name: `Language ${i}`,
              level: "Native" as const,
            })),
          })}
        />,
      );

      const list = within(documentSection("Languages")).getByRole("list");
      expect(list.className, `${count} language(s)`).toContain("grid-cols-3");
      expect(list.className).not.toMatch(/justify-(around|center|between)/);
      expect(list.className).not.toMatch(/\btext-center\b/);
      expect(within(list).getAllByRole("listitem")).toHaveLength(count);
      unmount();
    }
  });
});

describe("the projects section (AC5)", () => {
  it("renders three lines: the name, then the link, then the description", () => {
    render(<CvDocument cv={FULL_CV} />);
    const lines = Array.from(
      documentSection("Projects").querySelectorAll("p"),
    ).map((line) => line.textContent?.trim());

    expect(lines).toEqual([
      "difference-engine",
      "Live demo ↗",
      "A mechanical computer, in Rust.",
    ]);
  });

  it("shows the RAW url on line two when no link label is set", () => {
    render(
      <CvDocument
        cv={cv({
          projects: [
            {
              id: "p-1",
              name: "difference-engine",
              description: "A mechanical computer, in Rust.",
              link: "https://example.com/difference-engine",
            },
          ],
        })}
      />,
    );
    const lines = Array.from(
      documentSection("Projects").querySelectorAll("p"),
    ).map((line) => line.textContent?.trim());

    expect(lines).toEqual([
      "difference-engine",
      "https://example.com/difference-engine ↗",
      "A mechanical computer, in Rust.",
    ]);
  });

  it("treats a blank link label the same as a missing one", () => {
    render(
      <CvDocument
        cv={cv({
          projects: [
            {
              id: "p-1",
              name: "difference-engine",
              description: "",
              link: "https://example.com/de",
              link_label: "   ",
            },
          ],
        })}
      />,
    );

    const lines = Array.from(
      documentSection("Projects").querySelectorAll("p"),
    ).map((line) => line.textContent?.trim());

    expect(lines).toEqual(["difference-engine", "https://example.com/de ↗"]);
  });

  it("drops the link line, not the order, for a project with no link", () => {
    render(
      <CvDocument
        cv={cv({
          projects: [
            { id: "p-1", name: "difference-engine", description: "In Rust." },
          ],
        })}
      />,
    );
    const lines = Array.from(
      documentSection("Projects").querySelectorAll("p"),
    ).map((line) => line.textContent?.trim());

    expect(lines).toEqual(["difference-engine", "In Rust."]);
  });
});

describe("educationDegreeLine (AC4)", () => {
  it("joins a degree and its field of study with ' in '", () => {
    // RenderCV's own `DEGREE_WITH_AREA` phrase, mirrored so the preview reads
    // the way the PDF prints.
    expect(CV_EDUCATION_DEGREE_JOINER).toBe(" in ");
    expect(
      educationDegreeLine({
        id: "d",
        institution: "X",
        degree: "BSc",
        area: "Computer Science",
      }),
    ).toBe("BSc in Computer Science");
  });

  it("prints the degree alone when there is no field of study", () => {
    expect(
      educationDegreeLine({ id: "d", institution: "X", degree: "BSc" }),
    ).toBe("BSc");
    expect(
      educationDegreeLine({
        id: "d",
        institution: "X",
        degree: "BSc",
        area: "   ",
      }),
    ).toBe("BSc");
  });

  it("prints the field of study alone when there is no degree", () => {
    expect(
      educationDegreeLine({
        id: "d",
        institution: "X",
        degree: "",
        area: "Computer Science",
      }),
    ).toBe("Computer Science");
  });

  it("prints nothing when it has neither, so no dangling 'in' is typeset", () => {
    expect(
      educationDegreeLine({ id: "d", institution: "X", degree: "", area: "" }),
    ).toBe("");
  });
});

describe("the education section (AC4)", () => {
  it("renders between projects and certifications", () => {
    render(<CvDocument cv={FULL_CV} />);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);

    expect(headings.indexOf("Education")).toBe(
      headings.indexOf("Projects") + 1,
    );
    expect(headings.indexOf("Certifications")).toBe(
      headings.indexOf("Education") + 1,
    );
  });

  it("prints the institution with its period, then the degree line", () => {
    render(<CvDocument cv={FULL_CV} />);
    const education = within(documentSection("Education"));

    expect(education.getByText("University of Edinburgh")).toBeInTheDocument();
    expect(education.getByText("2010 — 2013")).toBeInTheDocument();
    expect(education.getByText("BSc in Computer Science")).toBeInTheDocument();
  });

  it("drops a row with nothing typed into it at all", () => {
    expect(
      visibleEducation([
        { id: "d", institution: " ", degree: "  ", area: "", period: " " },
      ]),
    ).toEqual([]);
  });

  it("keeps a row the user has only started, whichever field they began with", () => {
    // The server's `_education_entries` keeps a row if ANY of the four is
    // present. A narrower rule here would make the whole section vanish from
    // the LIVE preview mid-edit — the user fills the period and the heading
    // they were looking at disappears.
    for (const partial of [
      { institution: "University of Edinburgh" },
      { degree: "BSc" },
      { area: "Computer Science" },
      { period: "2010 — 2013" },
    ]) {
      expect(
        visibleEducation([
          { id: "d", institution: "", degree: "", ...partial },
        ]),
        JSON.stringify(partial),
      ).toHaveLength(1);
    }
  });
});

describe("the certifications section", () => {
  it("bolds the NAME and leaves the issuer plain", () => {
    // The server emits `**name** issuer` (`_labelled_line`) and the owner's
    // reference CV prints it that way. This used to be the other way round,
    // which read as though the issuer were the qualification.
    render(<CvDocument cv={FULL_CV} />);
    const entry = within(documentSection("Certifications")).getByRole(
      "listitem",
    );

    const name = entry.querySelector("span:first-child") as HTMLElement;
    const issuer = entry.querySelector("span:last-child") as HTMLElement;

    expect(name.textContent).toBe("AWS SAA");
    expect(issuer.textContent).toBe("Amazon Web Services");
    expect(name.className).toMatch(/font-semibold/);
    expect(issuer.className).not.toMatch(/font-(semibold|medium|bold)/);
  });
});

describe("the identity header", () => {
  it("carries no decorative rule between the headline and the contacts", () => {
    // The owner: "HUGE PROBLEM, is the spacing's between Full name, headline
    // and links/contacts/location, reduce the spacing". The accent bar WAS
    // that spacing, and his reference CV has no such rule.
    const { container } = render(<CvDocument cv={FULL_CV} />);
    const header = container.querySelector("header");

    expect(header?.querySelector(".bg-blue-700")).toBeNull();
    expect(header?.textContent).toContain("Ada Lovelace");
    expect(header?.textContent).toContain("Senior Backend Engineer");
  });
});
