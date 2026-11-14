# ADR-0017: A keyword tailoring binding and a keyword fit score (amends ADR-0007)

**Status:** Accepted (LuisMSoares, 2026-10-11) · **Date:** 2026-10-11 · **Deciders:** LuisMSoares

## Context

The ADR-0007 Decision says the CV builder uses the provider-agnostic tailoring port with the verbatim clone
binding only. The ADR-0007 Non-goals list ATS scoring.

PRD 0012 ports Ían Muliterno's keyword tailoring and fit score (`job_scrapping` branch,
`backend/app/application/services/cv_tailor_service.py` and `keywords_service.py`) onto master CVs. The owner chose
"Fit + keyword reorder (Recommended)". On the conflict with ADR-0007, on 2026-10-11, he chose "Amend via ADR 0017
(Recommended)" and "Opt-in action (Recommended)".

## Decision

- This ADR amends the ADR-0007 line. The CV builder now uses the tailoring port with two bindings: the verbatim
  clone, which stays the default, and the keyword binding below. The rest of ADR-0007 is unchanged, and "AI
  tailoring" stays excluded.
- `KeywordTailoringService` (`backend/app/application/services/keyword_tailoring.py`) implements the
  existing port `TailoringService` (`tailoring.py`). The port itself does not change. The binding is
  deterministic and uses no model, no network and no external service.
  - It starts from the same full snapshot that the clone makes.
  - It only reorders, in three places:
    - Within each skill category, keywords that match the job come first.
    - Skill categories with more matches come first.
    - Within each experience entry, bullets with more matches come first.
  - Ties keep the master CV's order (stable sort).
  - It never adds, removes or rewrites text. It never reorders experience entries, education, projects,
    certifications, languages or links.
  - It sets `was_ai_generated=false`. `adjustments` holds one `{section, description}` for each section it
    reordered.
  - A blank job description gives exactly the clone's result.
- The binding is chosen per request, not per deploy. `POST /applications/{id}/cv` and the job → draft route take
  `tailoring: "copy" | "keywords"`, default `"copy"`. `get_tailoring_service()` in
  `app/presentation/dependencies.py` becomes a resolver keyed by that value. When the value is absent the clone
  runs, so installed `applika-cli` versions keep getting the verbatim copy.
- The fit score lives in `backend/app/application/services/keyword_fit.py` as pure functions.
  - Job keywords: the 25 most frequent terms and the 25 most frequent word pairs of the job text, with stop words
    removed, plus the job's tags.
  - CV text: headline, summary, skill keywords, experience roles and bullets, project names and descriptions,
    and certifications.
  - Score: round(100 × matched ÷ job keywords), from 0 to 100, returned with the matched and missing lists.
  - The same input always gives the same output.
- The ADR-0007 non-goal "ATS scoring" is narrowed. The non-goal is now ATS scoring by a model or a rubric
  and ATS warnings. Keyword fit as defined above is allowed.
- Both pieces are ports of Ían Muliterno's code. Commits that port them carry
  `Co-authored-by: Ían Muliterno <iannimuliterno@gmail.com>`.

## Consequences

- Some PRD lines are superseded in part: PRD 0000 line 56 ("Tailoring is a verbatim copy now"), PRD 0000 line
  74 ("ATS scoring, CV improvement recommendations"), PRD 0007 R-016, and the PRD 0007 non-goal "ATS scoring,
  CV improvement suggestions". PRD 0012 lists them. PRD 0007 R-016 still holds for the default path.
- `tailored_cvs.adjustments` is no longer always `[]`. `applika-cli` already treats it as a read-only key
  (`cli/src/applika/schemas/cv.py` `READ_ONLY_KEYS`). Both changelogs record the change.
- A model-backed binding can still be added behind the same port later. The request value then gains a third
  option, with its own ADR.
- Matching is literal: synonyms, word stems and languages other than English score low. This is accepted,
  because the score is a hint, not a verdict.

## Non-goals

- AI or LLM tailoring or scoring. The ADR-0007 exclusion stands.
- ATS warnings, rubric scoring, improvement suggestions and text rewriting.
- Making keyword tailoring the default.
