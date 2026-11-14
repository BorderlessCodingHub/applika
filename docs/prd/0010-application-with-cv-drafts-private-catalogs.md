---
PRD: 0010
title: New application with CV, drafts, and private companies and platforms
status: Approved
owner: LuisMSoares
created: 2026-09-25
related-adrs: [0001, 0003, 0004, 0005, 0009, 0014]
related-prds: [0002-applications-steps-finalize.md, 0004-admin-supports-companies.md, 0007-cv-builder.md]
---

# PRD 0010 — New application with CV, drafts, and private companies and platforms

## In the owner's words

i would like to change how job applications is created, today i have to create an application entry and then attach a cv to this application, i want to add option to the user to create a job application and a cv together (this option will be available only in the web app, no support to the cli), when the user clicks to create an entry with a cv, instead of opening the sheet as is today, open a new page where the user selects a master cv to use as template, let the user edit the cv to the job and then in the next step the user fills the data about the application, like company, role name, platform, etc. I also want in the same plan to copy the same behavior in company to platform (when creating a new job application) today, all platforms is defined by the admin, and i want to able to the public add new platforms.

Addenda, word for word unless marked restated (line breaks and list markers folded into running text to keep this PRD under 200 lines):

Addendum, 2026-09-26 (restated, not word for word): use the same select component, with the same behavior, for company as for platform. Change the order of the inputs when creating an application with and without a CV: 1. role name and Source on a single line (as platform and source are placed in the form); 2. company and platform on a single line as well; 3. job link moved to the third line of the form. Group the form into sections: the first holds what every job application must have; in the second the user fills all other optional inputs and selects (work mode, experience level, country, currency, salary period, with work mode, experience level and country on a single line); in the third the user first pastes the job description and then the additional notes. On the admin page, Supports becomes Platforms and lists platforms with the same table component companies use, also showing how many applications each platform has. A new route returns the platforms instead of the `/supports` API route (same for `GET /companies`).

Second addendum, 2026-09-26: where is application date in the form to create an application with CV, also, you limited the form to max-w-4xl and i need to remove this, put application date and job link in a single line, for application create form with cv and without, also, increace the sheet component max width to 4xl (the sheet used to edit and create an application without a cv). Increace the sheet header front "Edit application" and "New Application". Now in the page where lists all my applications, create a tab to split my normal applications with drafts

Second addendum, change before approval, 2026-09-26: Redesign the “New application with CV” page to be cleaner, more compact, and card-free. - Remove the three large card containers around “Role & company”, “Details”, and “Posting & notes”. - Keep all existing fields, behavior, validation, state, and functionality unchanged. - Use section titles + muted descriptions for hierarchy, without icons or nested cards. - Separate sections with whitespace and subtle horizontal dividers. - Keep the existing dark theme and shadcn/ui components. - Desktop: - Role/Source → 2 columns - Company/Platform → 2 columns - Application Date/Job link → 2 columns - Work mode/Experience/Country → 3 columns - Currency/Salary period → 2 columns - Expected/Min/Max → 3 columns - Textareas → full width - Mobile: collapse everything to a single column with no horizontal overflow. - Keep Cancel/Continue actions at the bottom. - Reduce unnecessary vertical spacing while maintaining good readability. The final result should feel like one continuous Linear/Vercel-style form rather than three separate cards. Only change the UI/layout. Do not change application logic.

Second addendum, correction, 2026-09-26: apply this to edit and create without a cv

## Clarifications

- Q: When a user adds a new platform while creating an application, who sees it afterwards? (options: shared like companies / private to the creator / shared, admin approves) → A: "privater to the creator, but, i as an admin can approve and make available to everyone (still keeping the reference to who's created), this is what i also would like for companies, same behavior, firstly private to the user and then unlocked to the public. In the future i could create a feature to delete the duplicated ones and migrate to the one i released to the public."
- Q: Under the private-until-approved rule, what happens to the companies and platforms that already exist in production? → A: "All existing stay public (Recommended)" — option text: the migration marks every current company and platform public, so nobody loses a choice they see today; only rows users add after the release start private; rows an admin creates are public at once.
- Q: When does the new "application + CV" flow save anything? → A: "i would like to create an auto save mechanism and save as a draft, draft applications dont count's to the report and can be resumed at any time. I also want to change something that i said, the user first fill the data related to the application and then in the second step select a master cv to edit, this way i can create a draft application entry" — this reverses the step order of the story: step 1 is the application data, step 2 is picking a master CV and editing the copy.
- Q: Where do draft applications show up, and where are they hidden? → A: "Drafts section, hidden elsewhere (Recommended)" — option text: the applications page gets a "Drafts" section with Resume and Delete; drafts are excluded from reports, statistics, dashboard, cycles, agenda and admin stats; `GET /applications` (which installed CLIs call) never returns drafts; finishing a draft turns it into a normal application, dated when it is finished; auto-save writes to the draft about a second after typing stops; costs one additive status/is_draft column and a filter on every read path.
- Q: When does auto-save first create the draft row? → A: "Once required fields are set (Recommended)" — option text: step 1 auto-saves only after company, role and platform are filled (before that the browser keeps the typing); from then on every change auto-saves to the draft, including the CV copy in step 2; `platform_id` and other NOT NULL columns stay as they are; finishing requires a CV copy because this is the "with CV" flow.
- (2026-09-25) Q: R-006 before the draft exists (until company, role and platform are all set), where is the step 1 typing kept? → A: "Page memory + leave warning (Recommended)" — option text: typing lives only while the page is open; closing/reloading shows a "you'll lose this" warning; nothing left in browser storage on shared machines; a crash before the three fields are set loses at most those few fields.
- (2026-09-25) Q: Rolling back release B after two users each saved the same company as private — what should the downgrade do? → A: "Conditional index (Recommended)" (rebuild the unique index when no duplicates; otherwise non-unique ix_companies_name_url + log duplicate ids).
- (2026-09-25) Q: Where does the finish date of a draft come from? → A: "Browser's local day (Recommended)" (page sends the user's local calendar day; server applies existing ensure_not_in_future, 422 beyond).
- (2026-09-25) Q: Can a platform have no URL? → A: "Optional, null allowed (Recommended)" (users and admins may leave it empty; /supports sends null; fixes today's admin 500; one entry in each changelog).
- (2026-09-25) Q: When the admin adds a company or platform while tracking their own applications, is it public at once? → A: "no, the admin user still have to access the exclusive area and unlock the platform he created to the public, an admin user is like any other non admin users but with permissions to access some areas that a common user cant access" — so only rows created on the admin screens are public at once; rows an admin adds through the user flows are private and must be published on the admin screen.
- (2026-09-25) Q: Can a user fix or remove a company or platform they added themselves? → A: "Admin only, as written (Recommended)".
- (2026-09-26) Owner, amendment to this Approved PRD: the 2026-09-26 addendum under "In the owner's words" (restated there) — "Source" is the existing application mode field, labelled Source on screen. Recorded as R-028..R-036.
- (2026-09-26) Q: Where should this change go? → A: plan-writer adds it to PRD 0010 as new requirements, built as one slice covering backend and frontend, before the closing full-gate slice of Release B, which depends on it.
- (2026-09-26) Q: How to read the route sentence? → A: "GET /platforms + paginated admin list (Recommended)" — option text: new `GET /platforms?name=` returns visible platforms, searched like `GET /companies`, and the web platform select uses it instead of `/supports`; `GET /admin/platforms` becomes paginated with an application count per platform, like `/admin/companies`; `/supports` unchanged for the CLI.
- (2026-09-26) Owner, second amendment to this Approved PRD: "where is application date in the form to create an application with CV, also, you limited the form to max-w-4xl and i need to remove this, put application date and job link in a single line, for application create form with cv and without, also, increace the sheet component max width to 4xl (the sheet used to edit and create an application without a cv). Increace the sheet header front "Edit application" and "New Application". Now in the page where lists all my applications, create a tab to split my normal applications with drafts" — recorded as R-037..R-042, with R-003, R-011 and R-031 rewritten; built as one slice (backend + frontend) before the closing full-gate slice, which depends on it.
- (2026-09-26) Q: Should the "new application with CV" flow get an Application date field? (today none, R-003 "dated when it is finished") → A: "Add date field, default today (Recommended)" — option text: step 1 shows Application date beside Job link, preset to today and saved with the draft by auto-save; finishing uses that date, still refusing future dates; resuming a draft keeps the date; small backend change: the draft body gains `application_date` (column already exists, no migration), and R-003 is rewritten.
- (2026-09-26) Owner, change to the second amendment before approval: "Redesign the “New application with CV” page to be cleaner, more compact, and card-free. - Remove the three large card containers around “Role & company”, “Details”, and “Posting & notes”. - Keep all existing fields, behavior, validation, state, and functionality unchanged. - Use section titles + muted descriptions for hierarchy, without icons or nested cards. - Separate sections with whitespace and subtle horizontal dividers. - Keep the existing dark theme and shadcn/ui components. - Desktop: - Role/Source → 2 columns - Company/Platform → 2 columns - Application Date/Job link → 2 columns - Work mode/Experience/Country → 3 columns - Currency/Salary period → 2 columns - Expected/Min/Max → 3 columns - Textareas → full width - Mobile: collapse everything to a single column with no horizontal overflow. - Keep Cancel/Continue actions at the bottom. - Reduce unnecessary vertical spacing while maintaining good readability. The final result should feel like one continuous Linear/Vercel-style form rather than three separate cards. Only change the UI/layout. Do not change application logic." — recorded as R-043..R-050, part of the second amendment's slice; R-037 now puts the date before the job link. "Do not change application logic" binds this redesign only; the draft date change already agreed for that slice stays.
- (2026-09-26) Owner, correction: "apply this to edit and create without a cv" — the redesign covers both forms, step 1 of the new page and the side sheet that creates and edits an application without a CV.

## Problem

Giving an application its own CV copy takes two trips today: create the entry in the side sheet, then open the
application's CV page and pick a master CV (PRD 0007). The owner wants one guided flow that ends with an
application and its tailored CV together, and that never loses work: it saves as a draft while the user types,
and a draft can be finished later. Drafts are unfinished work and must not distort reports or statistics.

The platform list is fixed by the admin, so a user who applied through a platform not on it cannot record it.
A company a user adds is visible to every user at once. The owner wants users to add both companies and
platforms freely, private to them, and to decide himself which ones become visible to everyone.

## Users and stories

- US1 (P1) A signed-in user starts "new application with CV" in the web app, fills the application data (step 1), picks a master CV and edits the copy (step 2), and finishes with a normal application that holds its CV copy.
- US2 (P1) Once company, role and platform are set, the user's work saves itself as a draft; the user leaves and later resumes or deletes the draft from a Drafts section.
- US3 (P1) A user's drafts never show up in their reports, statistics, dashboard, cycles, agenda, in admin statistics, or in the application list the command-line client reads.
- US4 (P2) While creating or editing an application in the web app, a user adds a platform that is not listed, and only that user sees it.
- US5 (P2) A company a user adds is visible only to that user.
- US6 (P2) An admin sees the companies and platforms users added, with who added them, and publishes them to everyone.
- US7 (P3) Every company and platform that exists at release stays visible to everyone.
- US8 (P2, 2026-09-26) A user picks or adds a company with the same picker as a platform, and fills an application form grouped into three sections, in the side sheet and in the new page alike.
- US9 (P3, 2026-09-26) An admin manages platforms on a "Platforms" page that works like the companies page and shows how many applications use each platform.
- US10 (P2, 2026-09-26) A user sets the application date in both forms, next to the job link, and switches between their applications and their drafts with tabs on the applications page.

## Requirements

- R-001 The system offers, in the web app only, a "new application with CV" action beside the existing new-application action; the existing side sheet keeps working as today.
- R-002 The "new application with CV" action opens its own page, not the side sheet, with two steps: step 1 the application data (company, role, platform, mode and the other optional fields the side sheet has, job description included), step 2 picking one of the user's master CVs and editing the copy made from it.
- R-003 (rewritten 2026-09-26) Step 1 of this flow asks for the application date, preset to the user's own calendar day; the date is saved with the draft like every other field and kept when the draft is resumed, and finishing dates the application with it. The system refuses an application date later than the user's today.
- R-004 Step 2 behaves as the application CV page does today (PRD 0007): full snapshot copy, one copy per application, job description beside the editor, differences from the master shown, and a new copy from another master after deleting the current one.
- R-005 The system lets the user go back from step 2 to step 1, change the application data, and return to step 2 without losing the CV copy.
- R-006 The system creates the draft the first time company, role and platform are all set in step 1. Until then, what the user typed lives only in the open page and nothing is written to browser storage; closing or reloading the page first warns that the typing will be lost.
- R-007 Once the draft exists, the system saves every change to the application data and to the CV copy about one second after the user stops typing, without a save button, and shows whether the latest change is saved, saving, or failed.
- R-008 When a save fails, the system keeps what the user typed on screen, says the change is not saved, and saves it with the next attempt.
- R-009 The system lets the user finish a draft only when company, role and platform are set and the draft has a CV copy, and otherwise says what is missing.
- R-010 Finishing turns the draft into a normal application: it appears in the applications list, keeps its CV copy, and counts in reports and statistics from then on.
- R-011 (rewritten 2026-09-26) The Drafts tab of the applications page (R-041) lists the user's drafts with company, role and when each was last saved, with Resume and Delete on each.
- R-012 Resume reopens the draft on step 2 when it already has a CV copy, and on step 1 otherwise.
- R-013 Deleting a draft asks for confirmation and deletes its CV copy with it.
- R-014 The system excludes drafts from reports, statistics, the dashboard, cycles, the agenda, admin statistics and admin user counts; starting a new cycle never archives a draft.
- R-015 The application list read by command-line clients never contains drafts, and installed command-line clients keep working unchanged.
- R-016 A draft has no timeline, cannot be closed or reopened, and is changed only through the "new application with CV" page.
- R-017 While creating or editing an application in the web app, in the side sheet and in the new page, the user can add a platform that is not listed, with a name and an optional URL, the way a new company is added today. A platform may have no URL, whoever adds it, and every list shows such a platform without error.
- R-018 A company or platform a user adds is private: only that user sees it in lists and can pick it, until an admin publishes it.
- R-019 A company typed by name only stays free text on that application, as today, and appears in no list.
- R-020 The system refuses a new platform whose name, ignoring case, matches a platform the user already sees, and points the user to that platform.
- R-021 Adding a company whose name and URL match a company the user already sees reuses that company instead of making another.
- R-022 A user who submits a company or platform they cannot see gets "not found", and nothing is saved.
- R-023 The admin companies and platforms screens list private rows with the user who added them and offer Approve; approving publishes the row, which makes it visible to every user and keeps who added it.
- R-024 A company or platform added on the admin screens is public at once. One an admin adds while tracking their own applications is private, like any user's, until the admin publishes it on the admin screens.
- R-025 Every company and platform that exists when this feature is released stays public.
- R-026 Two users may each hold a private company, or a private platform, with the same name; the system keeps both. The system refuses to publish a row that would duplicate a public one and tells the admin which public row it collides with.
- R-027 Command-line clients keep listing and picking companies and platforms, and see the public ones plus the user's own private ones.

Added 2026-09-26 (owner amendment):
- R-028 In the web app, in the side sheet and in the new page, the company field uses the same picker as the platform field and behaves the same way: it searches the companies the user sees, marks private ones "only you", and offers to add a new one with a name and a URL.
- R-029 Adding a company with a URL in the picker saves it, private, as soon as the user confirms it, and selects it; a company the user already sees with the same name and URL is reused instead (R-021). Adding one without a URL keeps the name as free text on that application only (R-019).
- R-030 The application form, in the side sheet and in the new page, groups its fields into three titled sections: first what every application needs, then the optional details, then the job posting and notes.
- R-031 (rewritten 2026-09-26) The first section shows, one line each: role and source; company and platform; then the application date and the job link (R-037).
- R-032 The second section shows, one line each: work mode, experience level and country; currency and salary period; expected, minimum and maximum salary.
- R-033 The third section shows the job description first and the additional notes after it.
- R-034 The admin "Supports" page becomes "Platforms" and lists platforms with the same table the companies page uses: search, visibility filter, paging, who added each, Approve on private rows, and how many applications use each platform.
- R-035 A platform's application count, like a company's, leaves drafts out.
- R-036 The system offers the platforms a user sees as a list of their own, searchable by name, the way it offers companies, and the web picker reads that list; the support data that command-line clients read keeps its content and shape.

Added 2026-09-26 (owner's second amendment):
- R-037 In both forms, the side sheet and step 1 of the new page, the application date and then the job link share the third line of the first section.
- R-038 Step 1 of the new page puts no width limit of its own on the form; the form fills the page's content column.
- R-039 The side sheet that creates and edits an application without a CV opens wider, up to the 4xl width the owner named.
- R-040 The side sheet's title, "New Application" or "Edit Application", is shown in larger type than today.
- R-041 While the user views the current cycle, the applications page shows two tabs, "Applications" and "Drafts", the Drafts tab carrying the number of drafts. "Applications" is selected when the page opens and holds the list, its filters and its empty state as today. The Drafts tab replaces the former Drafts section; with no drafts it stays visible and says there are none, with a way to start a new application with CV.
- R-042 While the user views an archived cycle, the applications page shows no tabs and no drafts, only that cycle's applications, as today.

Added 2026-09-26 (owner's redesign, part of the second amendment; applies to both forms, the side sheet and step 1 of the new page):
- R-043 The three sections read as one continuous form: no card or box around any section, and no card inside a section.
- R-044 Each section shows its title and a muted description above its fields, with no icon.
- R-045 Whitespace and a subtle horizontal divider line separate one section from the next.
- R-046 On a wide form the lines lay out in columns: role and source, two; company and platform, two; application date and job link, two; work mode, experience level and country, three; currency and salary period, two; expected, minimum and maximum salary, three. The job description and the additional notes span the full width.
- R-047 On a narrow form every line collapses to a single column, and nothing on the form scrolls sideways.
- R-048 The actions stay at the bottom of the form: Cancel and the create or save action in the side sheet; Cancel and Continue to CV on step 1 of the new page.
- R-049 The form leaves less vertical space than today between sections, lines and fields, while labels, values, hints and error messages stay easy to read.
- R-050 The redesign changes only look and layout: every field, default, validation message, auto-save, draft creation, picker behavior and submitted value stays as it is, and the form keeps the app's dark theme and its existing interface components.

## Permissions and tenancy

A signed-in user can create, resume, change, finish and delete only their own drafts; another user's draft is
reported as not found, and so is a draft addressed as if it were a finished application. A user sees and can
pick public companies and platforms and the private ones they added themselves, and never another user's
private company or platform. A user cannot rename, delete or publish a company or platform, not even one they
added. An admin sees every company and platform, public or private, together with the user who added it, and
only an admin can publish, change or delete them, and only on the admin screens. Outside the admin screens an
admin is treated like any other user. Being an admin gives no access to another user's drafts or applications.
An anonymous visitor can do none of this.

## Edge cases

- The user fills company and role but never a platform and leaves: the page warns first; if the user leaves anyway, no draft exists and the typing is lost.
- The user has no master CV at step 2: the page invites them to create one; the draft stays and can be resumed.
- The master CV is deleted after the copy was made: the copy keeps its content (PRD 0007 R-007).
- The same draft is open in two tabs: the last save wins.
- The network drops during auto-save: the page says "not saved" and saves on the next change or retry.
- The user starts a new cycle while holding drafts: the drafts stay drafts; one finished later joins the current cycle.
- An admin tries to delete a private platform that a draft uses: refused, as for any platform in use.
- A user's account is deleted: their drafts go with it; the companies and platforms they added stay private, with no creator shown, until an admin publishes or deletes them.
- The user types a platform name that differs from a listed one only by case: the picker offers the listed one.
- An admin publishes a company whose name and URL equal a public company's: refused, naming the public one.
- A platform used only by drafts shows zero applications on the admin Platforms page, and deleting it is still refused, with the reason shown.
- The user types a company name that matches a listed one: the picker lists the match first and still offers to add a new company, since two companies may share a name with different URLs.
- A draft started before the application date was added shows the day it was started as its date; the user can change it before finishing.
- The user picks a date later than today: the picker does not offer it, and the system refuses it if it arrives anyway, and the draft is not saved until the date is fixed.

## Non-goals

- Any command-line support for the new flow, for drafts, or for adding platforms.
- Drafts in the side sheet flow.
- Merging duplicate companies or platforms (the owner's future feature).
- Unpublishing a company or platform.
- Users renaming or deleting the companies and platforms they added.
- Draft expiry or a draft limit.
- Model-based CV tailoring.

## Success signals

- A user goes from nothing to an application with its own edited CV copy in one page, without opening the side sheet.
- A user who closes the tab after the draft exists loses at most the last second of typing.
- Reports, statistics and admin numbers are the same before and after a user creates drafts.
- No user ever sees another user's private company or platform.
- Installed command-line clients keep listing, creating and editing applications after release.

## Assumptions

- Mode is preselected as "active" in step 1 so a draft can be saved as soon as company, role and platform are set; the user can change it.
- A new company with a URL, or a new platform, is saved, private, when the user confirms it in the picker, in either form (2026-09-26: the side sheet no longer waits for its submit). Both stay in the user's list even if the application is abandoned.
- A company URL is required to make it a listed company, as today.
- Private companies and platforms carry an "only you" label in the pickers.
- Publishing is one way in this feature.
- The admin action is labelled "Approve", the owner's word ("approve", "unlock"); this PRD calls its effect publishing.
- When the user clears company, role or platform after the draft exists, nothing is saved and the status reads "Not saved: company, role and platform are required" until all three are set again.
- After finishing, the user lands on the applications page and sees a confirmation.
- A company a user adds without the new flow (side sheet, command-line client) follows the same private rule.
- Companies users add between the database change and the release that uses it are public, as they are today.
- No notification tells the admin that a private row is waiting; the admin screens filter private rows.
- Drafts have no limit and never expire.
- (2026-09-26) Section titles: "Role & company" ("What every application needs."), "Details" ("Optional — how you'd work and what it pays."), "Posting & notes" ("The job posting and anything you want to remember.").
- (2026-09-26) The sheet title keeps its words ("New Application", "Edit Application"); only its size grows, to the size of a section heading on a page.
- (2026-09-26) The tabs are not remembered: the page opens on "Applications" each time, and deleting the last draft leaves the Drafts tab open on its empty state.
- (2026-09-26) Step 1's Cancel takes the user back to the applications page exactly as the "Back to applications" link does today, with the same warning about unsaved typing; a draft that already exists stays.
- (2026-09-26) "Wide" and "narrow" follow the form's own width, not the screen's, so the side sheet and the page switch to columns at the same form width.- (2026-09-26) The "Notes" field is labelled "Additional notes"; it is the same stored note.
- (2026-09-26) The company picker keeps today's company rules (R-019, R-021) and the "only you" label.
- (2026-09-26) The old admin "Supports" address sends the admin to the Platforms page, so a saved link still works.
