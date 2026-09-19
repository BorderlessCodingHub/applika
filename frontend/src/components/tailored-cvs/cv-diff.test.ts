import { describe, expect, it } from "vitest";

import { computeCvDiff, diffCv, type CvDiffSnapshot } from "./cv-diff";
import type { CvFormValues } from "@/components/base-cvs/types";

/** A minimal, fully-populated baseline — every test starts from a clone of it. */
function snapshot(over: Partial<CvDiffSnapshot> = {}): CvDiffSnapshot {
  return {
    name: "Backend CV",
    full_name: "Ada Lovelace",
    headline: "Senior Backend Engineer",
    location: "London",
    email: "ada@example.com",
    phone: null,
    summary: "Eight years on payment systems.",
    links: [],
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    languages: [],
    ...over,
  };
}

function values(over: Partial<CvFormValues> = {}): CvFormValues {
  return {
    ...snapshot(),
    phone: "",
    ...over,
  } as CvFormValues;
}

describe("diffCv (KODI-017 pinned cases)", () => {
  it("identical baseline and current: zero changes", () => {
    const base = snapshot();
    const result = diffCv(base, values());
    expect(result).toEqual({
      total: 0,
      sections: {
        identity: 0,
        links: 0,
        summary: 0,
        skills: 0,
        experience: 0,
        projects: 0,
        education: 0,
        certifications: 0,
        languages: 0,
      },
      changes: [],
    });
  });

  it("a scalar changed (headline)", () => {
    const base = snapshot();
    const result = diffCv(base, values({ headline: "Staff Engineer" }));
    expect(result.total).toBe(1);
    expect(result.sections.identity).toBe(1);
    expect(result.changes).toContainEqual({
      kind: "changed",
      section: "identity",
      path: "headline",
      before: "Senior Backend Engineer",
      after: "Staff Engineer",
    });
  });

  it("phone null vs. '' is NOT a change", () => {
    const base = snapshot({ phone: null });
    const result = diffCv(base, values({ phone: "" }));
    expect(result.total).toBe(0);
  });

  it("an experience item is added", () => {
    const base = snapshot();
    const item = {
      id: "x-1",
      company: "Stripe",
      role: "Backend Engineer",
      start: "2020-01",
      end: null,
      bullets: [],
    };
    const result = diffCv(base, values({ experience: [item] }));
    expect(result.sections.experience).toBe(1);
    expect(result.changes).toContainEqual({
      kind: "added",
      section: "experience",
      path: "experience:x-1",
      before: null,
      after: item,
    });
  });

  it("an experience item is removed", () => {
    const item = {
      id: "x-1",
      company: "Stripe",
      role: "Backend Engineer",
      start: "2020-01",
      end: null,
      bullets: [],
    };
    const base = snapshot({ experience: [item] });
    const result = diffCv(base, values({ experience: [] }));
    expect(result.sections.experience).toBe(1);
    expect(result.changes).toContainEqual({
      kind: "removed",
      section: "experience",
      path: "experience:x-1",
      before: item,
      after: null,
    });
  });

  it("an item field changed (role) plus bullets changed count as two changes", () => {
    const base = snapshot({
      experience: [
        {
          id: "x-1",
          company: "Stripe",
          role: "Backend Engineer",
          start: "2020-01",
          end: null,
          bullets: ["Shipped the ledger."],
        },
      ],
    });
    const result = diffCv(
      base,
      values({
        experience: [
          {
            id: "x-1",
            company: "Stripe",
            role: "Staff Engineer",
            start: "2020-01",
            end: null,
            bullets: ["Shipped the ledger.", "Owned on-call."],
          },
        ],
      }),
    );
    expect(result.sections.experience).toBe(2);
    expect(result.changes).toContainEqual({
      kind: "changed",
      section: "experience",
      path: "experience:x-1.role",
      before: "Backend Engineer",
      after: "Staff Engineer",
    });
    expect(result.changes).toContainEqual({
      kind: "changed",
      section: "experience",
      path: "experience:x-1.bullets",
      before: ["Shipped the ledger."],
      after: ["Shipped the ledger.", "Owned on-call."],
    });
  });

  it("skills: a keyword added, a keyword removed, and the category renamed", () => {
    const base = snapshot({
      skills: [
        { id: "s-1", category: "Languages", keywords: ["Python", "Go"] },
      ],
    });
    const result = diffCv(
      base,
      values({
        skills: [
          {
            id: "s-1",
            category: "Languages and frameworks",
            keywords: ["Python", "Rust"],
          },
        ],
      }),
    );
    expect(result.sections.skills).toBe(3);
    expect(result.changes).toContainEqual({
      kind: "changed",
      section: "skills",
      path: "skills:s-1.category",
      before: "Languages",
      after: "Languages and frameworks",
    });
    expect(result.changes).toContainEqual({
      kind: "keyword_added",
      section: "skills",
      path: "skills:s-1.keywords:Rust",
      before: null,
      after: "Rust",
    });
    expect(result.changes).toContainEqual({
      kind: "keyword_removed",
      section: "skills",
      path: "skills:s-1.keywords:Go",
      before: "Go",
      after: null,
    });
  });

  it("a pure reorder is not a change", () => {
    const a = {
      id: "x-1",
      company: "Stripe",
      role: "A",
      start: "2020-01",
      end: null,
      bullets: [],
    };
    const b = {
      id: "x-2",
      company: "Datadog",
      role: "B",
      start: "2021-01",
      end: null,
      bullets: [],
    };
    const base = snapshot({ experience: [a, b] });
    const result = diffCv(base, values({ experience: [b, a] }));
    expect(result.total).toBe(0);
  });

  it("a multi-section mix sums the right counts", () => {
    const base = snapshot({
      headline: "Senior Backend Engineer",
      links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
      education: [
        {
          id: "e-1",
          institution: "MIT",
          degree: "BSc",
          area: "",
          start: "2010-09",
          end: "2014-06",
        },
      ],
    });
    const result = diffCv(
      base,
      values({
        headline: "Staff Engineer",
        links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
        education: [],
      }),
    );
    expect(result.sections.identity).toBe(1);
    expect(result.sections.links).toBe(0);
    expect(result.sections.education).toBe(1);
    expect(result.total).toBe(2);
  });
});

describe("computeCvDiff (the internal shape the diff slots hook reads)", () => {
  it("carries a baseline `at` index for a removed item, among survivors only", () => {
    const a = {
      id: "x-1",
      company: "A",
      role: "A",
      start: "2018-01",
      end: "2019-01",
      bullets: [],
    };
    const b = {
      id: "x-2",
      company: "B",
      role: "B",
      start: "2019-01",
      end: "2020-01",
      bullets: [],
    };
    const c = {
      id: "x-3",
      company: "C",
      role: "C",
      start: "2020-01",
      end: null,
      bullets: [],
    };
    const base = snapshot({ experience: [a, b, c] });
    // `b` (the middle one) is removed; `a` survived before it, so `at` is 1.
    const detail = computeCvDiff(base, values({ experience: [a, c] }));
    expect(detail.lists.experience.removedList).toEqual([
      { id: "x-2", item: b, at: 1 },
    ]);
  });

  it("tracks added item ids per section", () => {
    const base = snapshot();
    const detail = computeCvDiff(
      base,
      values({
        projects: [{ id: "p-1", name: "OSS thing", description: "" }],
      }),
    );
    expect(detail.lists.projects.addedIds.has("p-1")).toBe(true);
  });
});
