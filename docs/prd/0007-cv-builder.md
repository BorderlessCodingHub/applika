---
PRD: 0007
title: CV builder (master CVs and one CV copy per application)
status: Approved
owner: LuisMSoares
created: 2026-09-15
related-adrs: [0004, 0005, 0007, 0010, 0011]
related-prds: [0000-product-vision.md, 0002-applications-steps-finalize.md, 0006-visual-identity.md]
---

# PRD 0007 — CV builder (master CVs and one CV copy per application)

## In the owner's words

the first one is the CV builder. a user can create up to 3 master CV's, select one and edit this master CV to the job specifications, each job application will store a "copy" of this master CV but edited to the job application. In the future i want to connect this to real models, but this is to the future.

## Clarifications

- Q: Is PDF export part of this feature? (options: client-side html2pdf / not in this feature / server-side RenderCV/Typst) → A: "Server-side RenderCV/Typst" — option text: best typographic output; adds a Python/Typst dependency to the API image, a new endpoint and a new ADR; no existing code to reuse.
- Q: What does "select one" mean? → A: "Pick per application (Recommended)" — option text: on an application the user chooses one of their master CVs and a copy is made from it (base CV picker); no default flag in DB; if the user has exactly one master CV it is preselected.
- Q: Is an application's CV copy fully independent of its master? → A: "Full snapshot (Recommended)" — option text: the copy stores every field incl. identity/contact (full_name, headline, email, phone, location, links); editing or deleting the master never changes a copy; costs a few extra columns on `tailored_cvs`.
- Q: How many copies per application, and job description? → A: "One copy + add job_description (Recommended)" — option text: one copy per application (unique constraint); deleting the copy allows making it again from any master; applications get a nullable `job_description` text shown next to the CV editor; ready for real models later; follows expand-first migration rule.
- Q: Can a CV copy be created or edited on a finalized or archived application? → A: "Read-only when finalized or archived (Recommended)" — option text: create/edit/delete of the copy returns 409 on finalized or cycle-archived applications; viewing and PDF export still work; consistent with steps today.
- Q (discovery): AI and plans? → A: no AI integration, subscriptions, ATS checking or CV improvement recommendations are planned yet; no plan tiers for now; `is_admin` stays for now; a better RBAC will be designed in the future.
- (2026-09-15) Q: Which sections does a CV have? → A: "links, abstract (about me), skills, experience, projects (optional section), certifications (optional section), languages"
- (2026-09-15) Q: Is "abstract (about me)" the existing summary text, and what does "optional section" mean? → A: "use summary, i got confused with the grammar"
- (2026-09-15) Q: What happens to an application's CV copy when its master CV is deleted? → A: "Forget source, keep content (Recommended)"
- (2026-09-17) Q: Do links render as their own section? → A: "Links isn't a section, it must appear in bellow the headline, alongside with my email, location and links." Links belong to the identity/contact line. The plan's mapping sentence "links → social networks or one-line entries" (not from the owner) made a non-social link fall back to a rendered `Links` section; that fallback is removed.
- (2026-09-17) Q: Was education cut from the CV sections? → A: "I never said to cut out education, only key achievements" — the owner never excluded education. The 2026-09-15 section list simply did not name it, and this PRD wrongly turned that silence into an exclusion. Education is IN SCOPE.
- (2026-09-15) Q: Which PDF look does v1 use? → A: "I already have a custom template inside "custom-template-reference" folder, do not reference the real cv and yaml data and cv output in the docs. Rename this template to Applika."
- (2026-09-15) Q: How is the limit of three master CVs enforced? → A: "Count under a user-row lock (Recommended)"
- (2026-09-15) Q: Which error on changing the CV copy of an archived application? → A: "Match steps: 409 finalized, 422 archived (Recommended)"

- (2026-09-18) Owner: "when i click in CV button in an application "/cv?id=<id>" when this application dont have any copy cv attached, instead of using the full width, change it to the max width convention we choose to the app, only full width when we have a cv copy to the application, another thing to change, before the CV copy when the user needs to select one of 3 master CV's, we're still displaying the skills categories names instead of the keywords, change it to match with the "/cvs" page, and when the user still have slots left to be used to create news master cv's, display the same component we have in "/cvs" page as well - basically just use the same components there in here with the same buttons to delete, edit and download."

- (2026-09-19) Owner: "when i select to use a master cv and create a copy, when the page changes to edit this copy of the master CV is showing the old proportion instead of 50/50 (w-1/2 from tailwind) but here i want some new changes, instead of showind the job description in the right side just above cv preview, move to the left above identity and contact. In the same page, load the original master CV (the one saved in base_cv_id) - if available, if the user deletes the master cv just fill the base_cv_id with null - I want something in the form to tell me what was from the original cv and what changed (a diff). Think in something because this will be useful when we create the auto cv tailoring usign the job description and application notes". Diff design → "Inline markers + revert (Recommended)". Baseline → "Snapshot taken at copy time (Recommended)": the server stores the master CV content at copy time; existing copies without a snapshot compare against the current master via `base_cv_id`; no master and no snapshot → no diff. Migration placement → "New revision at head (after R2)": owner-accepted exception to `.claude/rules/prod-release-runbook.md` 4 — the snapshot column ships with the code that uses it, so CV copy routes fail between the B+C deploy and the manual `alembic upgrade head`.

- (2026-09-19) Owner: "Create a button in the page where I can download a pdf or markdown file of the diff and also create a version of the CV in markdown along side with pdf (that already exists) for download". Rendered on the server, as the PDF already is (ADR 0011: no client-side rasteriser).

## Problem

A job seeker sends a slightly different CV to each job. Applika tracks applications but holds no CV,
so the user keeps CV versions elsewhere and loses which version went to which company. The owner
wants a small set of master CVs and, per application, a copy edited for that job, kept with the
application. The copy is the future input for real models, so the job description must live next
to it.

## Users and stories

- US1 (P1) A signed-in user creates, lists, edits and deletes up to three master CVs.
- US2 (P1) On one of their applications, a user picks a master CV and gets a copy bound to that application.
- US3 (P1) A user edits an application's CV copy for that job while reading the job description beside it.
- US4 (P2) A user deletes an application's CV copy and makes a new one from any master CV.
- US5 (P2) A user downloads a master CV or an application's CV copy as a PDF.
- US6 (P2) A user stores and edits the job description text of an application.
- US7 (P3) A user views, and downloads as PDF, the CV copy of a finalized or archived application, and cannot change it.

## Requirements

- R-001 The system lets a signed-in user create a master CV with a label, identity and contact (full name, headline, location, email, optional phone, links), a summary, and the sections skills, experience, projects, education, certifications and languages. Links are part of the identity/contact line, **not** a rendered section — see the 2026-09-17 clarification.
- R-002 The system refuses a fourth master CV for the same user and tells the user the limit is three, also when several create requests arrive at the same time.
- R-003 The system lists, shows, updates and deletes a user's own master CVs.
- R-004 The system has no default master CV; the user picks a master CV on each application.
- R-005 When the user has exactly one master CV, the system preselects it in the application's picker.
- R-006 The system creates an application's CV copy from the chosen master CV as a full snapshot of every field, identity and contact included.
- R-007 The system never changes a CV copy when its master CV is edited or deleted, and never blocks deleting a master CV; after the master is deleted the copy keeps all its content, forgets its source, and shows "source CV deleted".
- R-008 The system holds at most one CV copy per application and refuses a second one.
- R-009 The system lets the user edit every field of an application's CV copy.
- R-010 The system lets the user delete an application's CV copy, after which a new copy can be made from any of the user's master CVs.
- R-011 The system stores an optional job description text on each application, editable when creating or updating the application.
- R-012 The system shows the application's job description next to the CV copy editor.
- R-013 The system refuses creating, editing or deleting the CV copy of a finalized application as a conflict, and of an application archived in a cycle as a business-rule violation, matching how steps are refused today; it still allows viewing and PDF download of that copy.
- R-014 The system produces a PDF of a master CV and of an application's CV copy on the server, typeset from the stored CV data with one fixed theme named Applika, derived from the owner's template; the user does not choose a theme.
- R-015 The system tells the user, near the preview and the download action, that the on-screen preview does not show the final PDF layout.
- R-016 The system makes the CV copy through a tailoring step whose only behaviour today is a verbatim copy, so that real models can replace it later without changing the stored CV shape.
- R-017 The system deletes an application's CV copy when the application is deleted.
- R-018 Existing command-line clients that create or update applications without a job description keep working, and an update that omits the job description leaves the stored text unchanged.
- R-019 The web application CV route (`/applications/cv?id=`) uses the app's reading-column width (`max-w-7xl`) while the application has no CV copy, and the full page width only once a copy exists.
- R-020 The web master CV picker on the application CV route renders the same components as the `/cvs` page: the same CV cards (keywords, not skill category names), the same edit, delete and download buttons, and the same new-CV card while the user has master CV slots left.
- R-021 The web CV copy editor splits the form and the preview 50/50 at every width from `md` up, and shows the job description panel in the form column above Identity and contact.
- R-022 The system stores, when a CV copy is created, a snapshot of the master CV content it was copied from, and keeps it when the master CV is later edited or deleted; deleting a master CV sets the copy's `base_cv_id` to null.
- R-023 The web CV copy editor compares the copy with its baseline (the snapshot, or the current master CV when an older copy has no snapshot) and shows a summary of the number of changes with a toggle; with it on, changed fields show a "Changed" marker with the original value and a Revert action, added list items show "Added", removed list items show as restorable rows, and each section header counts its changes.
- R-024 The web CV copy editor offers a download of the diff between the copy and its baseline as a PDF or a Markdown file, rendered by the server.
- R-025 The system offers every CV that can be downloaded as a PDF (master CVs and CV copies) as a Markdown file as well, next to the PDF download.

## Permissions and tenancy

A signed-in user can create, read, update, delete and download only their own master CVs and only
the CV copies of their own applications. A master CV or a CV copy that belongs to another user is
reported as not found, and a user cannot make a copy from another user's master CV or onto another
user's application. Being an admin gives no access to another user's CVs, and no admin screen lists
CVs. An anonymous visitor can do nothing with CVs. The limit of three master CVs counts per user.

## Edge cases

- A user with zero master CVs opens an application's CV area: the system invites them to create a master CV first.
- A user at three master CVs: the create action is disabled and the refusal is explained.
- Two create requests race at the limit: at most three master CVs exist afterwards.
- The master CV is deleted while its copy exists: the copy stays complete, shows "source CV deleted", and still downloads.
- The application is finalized or archived after its copy exists: the copy becomes read-only.
- The application has no job description: the editor shows an empty-state hint, not an error.
- A CV with empty sections: the PDF omits the empty sections and still renders.
- PDF typesetting fails or runs too long: the user sees an error and nothing is changed.
- A very long CV or job description: the system accepts it up to the stated limits and rejects above them.

## Non-goals

- AI or model-based tailoring, ATS scoring, CV improvement suggestions.
- Plan tiers, quotas, permission strings, RBAC.
- Importing or parsing a PDF or a Word CV.
- A default master CV flag.
- More than one CV copy per application; CV version history.
- PDF theme selection, or any PDF theme besides Applika.
- Key achievements section. (Education is IN scope — see the 2026-09-17 clarification.)
- CLI commands for CVs.
- Sharing a CV by public link.

## Success signals

- A user can go from zero CVs to a downloaded, job-specific PDF for an application in one session.
- Every application created after release can carry its own CV copy and job description.
- No CV of one user is ever visible to another user (ownership tests pass on every CV route).
- Existing CLI versions keep creating and updating applications after release.

## Assumptions

- Summary, skills, experience and languages are expected sections; projects, education and certifications may be empty and are then omitted from the PDF. Links never render as a section. (Owner reviews at sign-off.)
- No section is required to save a CV; any empty section is omitted from the PDF.
- The master CV label is required and is the name shown in lists and the picker.
- Email and full name are required on a master CV; phone is optional.
- The CV copy gets the master CV's label at copy time, editable afterwards.
- Job description is plain text, up to 50,000 characters.
- Master CVs are managed on their own "CVs" page; the CV copy lives on an application's own CV page.
- The job description is edited on the application form, and shown read-only beside the CV editor.
- Deleting a user deletes their master CVs and CV copies.
- PDF download works for finalized and archived applications (read access).
- Editing the job description stays allowed wherever application update is allowed today.
- The UI is English only, matching today's applika.
- The screens use the look shipped by PRD 0006.
