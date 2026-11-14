# ADR-0011: Server-side CV PDF rendering with RenderCV and Typst

**Status:** Accepted by LuisMSoares on 2026-09-15 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

PRD 0007 (CV builder) needs a PDF of a master CV and of an application's CV copy. The owner chose
"Server-side RenderCV/Typst" over client-side html2pdf and over leaving PDF out. No existing code
renders a CV PDF. ADR-0007 lists RenderCV under its non-goals, so it needs its own decision. The
owner also chose a full snapshot for the CV copy, so a copy carries its own identity and contact
fields. The owner's CV sections are summary, links,
skills, experience, projects, certifications and languages. The owner supplied a RenderCV theme in
`custom-template-reference/custom/` and asked for it to be renamed Applika.

## Decision

- Rendering design:
  - §A engine: RenderCV with the Typst engine, no TeX.
  - §B mapping table: a pure mapper turns each CV section into its RenderCV entries; an empty
    section is not rendered.
  - §D endpoints: one `POST .../pdf` route per CV kind returns the PDF with `Content-Disposition`.
  - §E execution: rendering runs in a threadpool, off the event loop, under a hard timeout; a
    failure or a timeout raises `PdfRenderFailed` → 500.
  - §G preview: the on-screen preview stays, with a mandatory notice that it does not show the
    final PDF layout.
- Applika specifics:
  - §C theme: v1 renders with one fixed theme named `applika`, with no theme picker and no theme
    setting. It is the owner's theme from `custom-template-reference/custom/`, renamed from `custom`
    to `applika` (`class ApplikaTheme(ClassicTheme)`, `theme: Literal['applika']`). It is vendored
    into `backend/app/application/services/cv_rendering/themes/applika/`, with its design
    settings (A4, Source Sans 3, centered header, `centered_with_partial_line` section titles, the
    owner's sizes, margins and colors) stored in code as the theme defaults. RenderCV's built-in
    `classic` theme is not used directly.
  - §B mapping: no `key_achievements` and no `education` section. The theme's three-column section
    grid applies to `languages` only.
  - No identity merge at render time. Both `base_cvs` and `tailored_cvs` rows carry identity and
    contact fields, and each renders from its own row.
  - Ownership follows ADR-0004 (row `user_id`, foreign row = 404), not permission strings or an
    Owner-role bypass.
  - Routes are `POST /api/base-cvs/{id}/pdf` and `POST /api/applications/{id}/cv/pdf`. PDF download
    is allowed on finalized and archived applications.
  - The API and frontend are separate origins (ADR-0010), so CORS exposes `Content-Disposition`.
- New backend dependency: `rendercv` with its Typst binary wheel, pinned to a version the vendored
  templates work with and locked in `backend/uv.lock`. No system packages. It lands only in
  the API image (`backend/Dockerfile`); the nginx frontend image is unchanged.
- New setting `CV_PDF_RENDER_TIMEOUT_SECONDS` (default 30). Rendering writes no row.
- This ADR amends ADR-0007's non-goal on RenderCV; the other ADR-0007 exclusions (AI tailoring,
  plan tiers, quota) stand.

## Consequences

- The API image grows by an estimated 40 to 100 MB. The S4 pull request of plan 0007 records the
  measured size before and after.
- A render uses 1 to 3 seconds of CPU on the VPS, off the event loop.
- The preview and the PDF look different in v1, and the UI says so.
- Upgrading RenderCV means re-checking the vendored templates.
- If Source Sans 3 is not bundled, the font files are vendored beside the theme.
- The Python 3.14 runtime needs a Typst wheel for linux amd64; if none exists, this ADR is revisited
  before implementation.
- No task worker or queue. A bulk export needs a new ADR.

## Non-goals

- A theme picker, or any theme besides `applika`.
- Client-side PDF (`html2pdf.js`).
- Importing or parsing PDFs.
- LaTeX.
