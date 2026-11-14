# `cv-diff` shared fixtures

One JSON file per test case, kept in the backend's test fixtures
(`applika/backend/tests/fixtures/cv-diff/`, beside `tests/fixtures/jobs/`) and
loaded by **both** the backend pytest suite
(`applika/backend/tests/unit/test_cv_diff_fixtures.py`) and the frontend
vitest suite
(`applika/frontend/src/components/tailored-cvs/cv-diff.fixtures.test.ts`, via
the relative path `../../../../backend/tests/fixtures/cv-diff` back to this
folder; it fails when the folder is missing). Both implementations of the CV
diff - the pure Python one (`app/application/services/cv_diff.py`) and the
pure TypeScript one (`cv-diff.ts`) - must produce `expected` for the same
`baseline`/`current` pair. That is what proves the two are the same diff, not
just two diffs that happen to agree on the cases each author thought of.

## Shape

```json
{
  "name": "<human description of the case>",
  "baseline": { "...": "a TailoredCVContent-shaped document" },
  "current": { "...": "a TailoredCVContent-shaped document" },
  "expected": {
    "total": 3,
    "sections": {
      "identity": 0, "links": 0, "summary": 0, "experience": 0,
      "languages": 0, "skills": 3, "projects": 0, "education": 0,
      "certifications": 0
    },
    "changes": [
      {
        "kind": "changed",
        "section": "skills",
        "path": "skills:skl-1.category",
        "before": "Languages",
        "after": "Languages & Frameworks"
      }
    ]
  }
}
```

- `baseline` and `current`: plain objects with the CV content shape -
  `name`, `full_name`, `headline`, `location`, `email`, `phone`, `summary`
  and the seven sections (`links`, `skills`, `experience`, `projects`,
  `education`, `certifications`, `languages`), each item carrying its
  client-generated `id`.
- `expected.total`: the number of changes.
- `expected.sections`: **always** the same nine keys, in this order -
  `identity`, `links`, `summary`, `experience`, `languages`, `skills`,
  `projects`, `education`, `certifications` - even when a section's count is
  `0`.
- `expected.changes`: one entry per change. `kind` is one of `"changed"`,
  `"added"`, `"removed"`, `"keyword_added"`, `"keyword_removed"`. `path` is
  `"<field>"` for an identity/summary scalar, `"<section>:<id>"` for a whole
  added/removed item, `"<section>:<id>.<field>"` for a changed item field, or
  `"<section>:<id>.keywords:<keyword>"` for a keyword add/remove. `before`/
  `after` are `null` on the side that does not apply (e.g. `before` is
  always `null` for `"added"`).

**Comparing `changes` is order-insensitive**: both suites sort the list by
`(path, kind)` before comparing it against `expected.changes`, because the
two implementations do not have to walk sections and items in the same
order to agree on the same set of changes.

## Normalisation rules both diffs implement

- `null`, missing and `""` compare equal for a scalar field.
- `bullets` (an experience item's bullet list) compares as one whole value:
  any difference is a single `"changed"`, never one change per bullet.
- `keywords` (a skill category's keyword list) compares as a **set**: each
  keyword present on only one side is its own `"keyword_added"` or
  `"keyword_removed"`.
- List items are matched by their `id`, never by position - a pure reorder
  produces zero changes (see `08-reorder-only.json`).

## Files

| File | Case |
|---|---|
| `01-identical.json` | Baseline equals current: zero changes |
| `02-scalar-changed-headline.json` | One identity scalar changed |
| `03-phone-null-vs-empty-string.json` | `phone: null` vs `phone: ""`: normalised equal, zero changes |
| `04-experience-item-added.json` | A new experience item, current only |
| `05-experience-item-removed.json` | An experience item, baseline only |
| `06-experience-role-and-bullets-changed.json` | One item's `role` and its whole `bullets` list changed |
| `07-skills-keyword-added-removed-category-renamed.json` | A skill category renamed, one keyword added and one removed |
| `08-reorder-only.json` | Two experience items reordered, ids and fields unchanged: zero changes |
| `09-multi-section-mix.json` | Changes across identity, summary, links, experience and education, counted per section |

Adding a case: add a new `<NN>-<slug>.json` file with the shape above.
Both suites load every file in this folder, so nothing else needs
registering.
