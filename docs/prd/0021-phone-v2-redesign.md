---
PRD: 0021
title: Phone layout from the V2 mobile redesign
status: Approved
owner: LuisMSoares
created: 2026-11-08
related-adrs: [0006, 0018, 0019, 0022, 0024, 0025, 0026, 0027]
related-prds: [0006-visual-identity.md, 0019-language-switcher-and-error-codes.md, 0020-borderless-oidc-sign-in.md]
---

# PRD 0021 — Phone layout from the V2 mobile redesign

## In the owner's words

download the artifact with name "Applika to mobile devices" but only the "v2 - redesign" and "sign-in logo options", ignore the "v1 - first pass", I need a plan to implement all screens in just one plan and feature branch with name "labs01-146", all futures components and pages needs also to be designed for mobile as well (keep this artifact always up to date). To the artifact for sign-in, I choose the option C.

## Clarifications

- Q: How do the V2 screens reach phones? (Responsive web + installable / Responsive web only / Native app wrapper) → A: "Responsible web only, for now (the idea of creating an app and publish in app and play stores will be discussed in the future and probably done in expo to reuse the components is next.js/react, in others and simply words, the apps is out of scope, for now)"
- Q: What happens to the desktop layout? The artifact designs only phone width (390 px), apart from sign-in option C, which has a desktop board. → A: "Phone only, desktop as today (Recommended)" — option text: below 768 px every screen gets its V2 board; at 768 px and up the sidebar shell and current pages stay as they are; sign-in uses option C at both widths, since C has both boards; routes stay the same; pages that only exist on phones (Insights, Account hub) get a plain desktop rendering or a redirect.
- Q: Does the phone layout keep the light/dark toggle? (ADR-0006 says "Light and dark both stay", toggle kept; the artifact's V2 note says "Mobile is dark only, like the web app"; the V2 Account hub has a Language row but no theme row) → A: "If light and dark toggle exists today, keep in both versions"
- Q: When is the artifact updated, and who does it? → A: "Skip this instruction to keep artifact up to date, just download the current one, new screens gets its own artifact"
- Q: What about routes that have no V2 board? (/cli, /cvs/new, /applications/cv, /admin/features/view, /admin/companies, /admin/platforms, /admin/supports, /admin/users, /admin/features, /admin/discord-webhooks) → A: "Only boarded screens for now, but spawn a second artifact creating a v3 coping the v2 artifact and expanding with the missing screens, the boarded ones will be addressed in this plan"
- Q: How many days without an update make an open application stale? → A: "i'll pick the recommended ones" — chose the recommendation: more than 14 days, counted from the later of the application date and the latest event's date.
- Q: Average days per step: the gap between consecutive stage averages (keeps the board's labels), or days from the application date (exact, labels change)? → A: "i'll pick the recommended ones" — chose the recommendation: the gap between consecutive stage averages, never below zero, a dash when a stage has no data, with the board's labels.
- Q: Where do the Pipeline stages come from: the latest-step summary the API already sends with each application (no backend change), or a new latest-event summary added to the API? → A: "i'll pick the recommended ones" — chose the recommendation: the summary the API already sends; adding the new one is a follow-up, due before the old command-line compatibility layer is retired.
- Q: Insights and the Account hub at 768 px and up: a redirect, or a desktop page of their own? → A: "i'll pick the recommended ones" — chose the recommendation: a redirect, to the dashboard and to the profile.

## Problem

Applika on a phone is the desktop app squeezed: a sidebar folded into a menu, a header that wraps onto three rows, and pages laid out for a mouse. The owner has a phone design, V2, that gives every screen a layout made for a thumb: a bottom tab bar, large touch targets, sheets instead of dialogs, and a Today screen that says what needs doing now. The owner chose sign-in option C, the Applika app icon with a Borderless badge, for phones and desktops alike. The desktop stays as it is.

## Users and stories

- US1 (P1) A job seeker on a phone opens applika and sees Today: the next interview, three numbers, the applications that went quiet, and what comes next.
- US2 (P1) A job seeker on a phone adds an application from a short sheet in under a minute, then finds it in the Pipeline under its stage.
- US3 (P1) A job seeker on a phone opens an application, sees its stage, next step, details and history, and logs an update or closes it.
- US4 (P1) A user signs in with option C on a phone or a desktop, sees why a sign-in failed, and is told when to return to the terminal.
- US5 (P1) A desktop user sees no change anywhere except the sign-in page, which shows option C.
- US6 (P2) A job seeker on a phone checks the week's interviews on the Agenda, turns sound alerts on and adds one to the calendar.
- US7 (P2) A job seeker on a phone reads Insights: success rate, funnel, applications per week, days per step, active vs passive.
- US8 (P2) A job seeker on a phone reaches every other part of applika from the Account hub, switches language and theme there, sends feedback and logs out.
- US9 (P2) A beta user on a phone browses jobs, checks the fit, starts a draft with a CV, and manages master CVs.
- US10 (P2) A Borderless member on a phone fills and submits a biweekly report; a non-member sees why reports are closed to them.
- US11 (P3) A user on a phone manages cycles, profile and devices, approves a device code and copies a CLI code.
- US12 (P3) An administrator on a phone reads the admin dashboard, switches job sources and sees report webhooks.
- US13 (P3) A visitor on a phone reads the landing page and the cookie policy and signs in from either.

## Requirements

- R-001 Below 768 px wide, every screen that has a V2 board renders that board's layout, components, spacing, sizes and copy. (story: "implement all screens"; Q2)
- R-002 At 768 px and up every screen renders as it does today, except the sign-in page. (Q2: "desktop as today")
- R-003 The sign-in page renders option C at both widths, in each of its states: ready, opening Borderless, refused with its reason, started from the command line, and refused while started from the command line. (story: "I choose the option C"; Q2)
- R-004 Every screen keeps its address. Insights and the Account hub are the only new addresses; opened at 768 px and up, they redirect the user to the dashboard and to the profile. (Q2: "routes stay the same", "a plain desktop rendering or a redirect"; Q9)
- R-005 On a phone, Today, Pipeline, Agenda and Insights show a bottom tab bar with those four entries and mark the current one. No phone screen shows the sidebar or the navigation menu. (story: "all screens"; Q2)
- R-006 On a phone, every screen without the tab bar shows a top bar with a back link named after the screen it returns to. (story: "all screens")
- R-007 On a phone, Today and Pipeline show an Add button that opens the quick-add sheet. (story: "all screens")
- R-008 On a phone, Today, Pipeline, Agenda and Insights show the user's initials; pressing them opens the Account hub. (story: "all screens")
- R-009 The Account hub lists Jobs, CVs, Reports and Cycles; Profile, Devices & CLI, Sign in a device and Admin; the language choice; the theme choice; Send feedback; Logout; and the cookie policy. Each entry shows only to a user who can open it today. (story: "all screens"; Q3)
- R-010 Light and dark both work on every phone screen. The theme is switched from the Account hub and from every public screen that has the switch today. (Q3: "keep in both versions")
- R-011 Every new word exists in English and in Brazilian Portuguese, and every phone screen follows the language switch. (story: "all screens"; the two-language decision of PRD 0019)
- R-012 Today shows the date and a greeting with the user's first name; the next interview with its time to start, time range, an add-to-calendar action and an open action; active applications, offers and success rate, which lead to Insights; the applications that need attention; and the interviews coming up. (story: "all screens")
- R-013 An open application needs attention when it has had no update for more than 14 days, counted from the later of its application date and its latest event's date. Today lists each with its company, role and days without an update, plus Log update and Close it. With none, Today says "All caught up. Every active application has a recent update." (story: "all screens"; Q6)
- R-014 The Pipeline shows the cycle and its application count; filter pills for All and each stage with their counts; the applications grouped by stage (Technical, Screening, Applied, Offer, Closed), each with its company, role, time since its last update, a Stale marker when R-013 applies, and the outcome when closed; three per stage with "Show N more"; and a search. (story: "all screens"; Q8)
- R-015 The quick-add sheet asks for company, role, where the user applied and the application date (today, yesterday or a picked date). Link, work mode and salary sit behind "More details". "Add to pipeline" creates the application and opens it. "Start with a CV instead" opens the new application with CV, for users who have CVs. (story: "all screens")
- R-016 The application screen shows the company, role, application date and platform; the stage reached; the next scheduled step with add to calendar; the details that are filled in; the job posting link; the history; the notes; and Close and Log update. A closed application offers Reopen instead and accepts no update. (story: "all screens")
- R-017 The Agenda shows a week strip the user can move by week, the chosen day's interviews with time, stage, time to start, notes, a sound-alert switch, add to calendar and open, a message for an empty day, and the interviews after it. (story: "all screens")
- R-018 Insights shows the cycle choice, the success rate with offers, applications and active, the funnel, applications per week over eight weeks, average days per step, and active vs passive. (story: "all screens")
- R-019 Average days per step reads "Applied → Screening", "Screening → Technical" and "Technical → Offer". "Applied → Screening" is the average days from the application to Screening; each later row is the gap between its two stages' averages, never below zero. A row shows a dash when either of its stages has no data. (story: "all screens"; Q7)
- R-020 Profile and Devices form one phone screen with a Profile / Devices switch. Profile shows the user, the membership, the bio, details, tech stack, achievement badges, the GitHub restore while it is available, delete account and Edit. (story: "all screens")
- R-021 Devices shows each signed-in browser and CLI with a this-device marker, IP address, last use and expiry, Sign out for this device and Revoke for the others, Sign out all other devices, and the sessions ended in the last 30 days with their status. (story: "all screens")
- R-022 Sign in a device goes from the code, to the request details with a warning, to approve or deny, to the outcome. (story: "all screens")
- R-023 The CLI code screen shows the code, a Copy action that confirms the copy, and the expiry hint. (story: "all screens")
- R-024 The welcome screen asks once whether to bring back the GitHub account or start empty. (story: "all screens")
- R-025 The landing page and the cookie policy render their V2 boards, with a sign-in action always in reach on the landing page. (story: "all screens")
- R-026 Jobs shows the search, the Best fit and Newest sort, the source and other filters, and each job with title, company, source, fit, tags, age and Dismiss or its draft or applied mark. (story: "all screens")
- R-027 A job shows its fit per master CV with matched and missing keywords and its description, with Dismiss and Start application. Start application is a sheet that picks a master CV or none, and a verbatim or keyword-tailored copy. (story: "all screens")
- R-028 The new application with CV shows its two steps, saves as the user types, and ends with Finish. (story: "all screens")
- R-029 CVs lists the master CVs with headline, last update, skills, counts, Edit and Delete, and a new-CV tile with the slots left. The CV editor shows the sections as an expandable list, a PDF action, and Save changes. (story: "all screens")
- R-030 Reports shows a member the challenge day and progress, the tip, the current report, and the submitted and upcoming ones; it shows a user without a membership the reason and the way out. A report day shows its computed metrics, manual metrics, reflection, totals and goal, with Submit Report. (story: "all screens")
- R-031 Cycles shows the current cycle with New Cycle, and each archived cycle with View and Delete, each confirmed in a sheet. (story: "all screens")
- R-032 The admin console shows its sections as chips. Dashboard, Jobs and Report webhooks render their boards; Users, Companies, Platforms and Features keep today's content under the same header. (story: "all screens"; Q5)
- R-033 A screen without a V2 board stays reachable on a phone and keeps today's content inside the phone layout, with a back link. (Q5: "Only boarded screens for now")
- R-034 Every control on a phone screen is at least 44 px in each direction and carries the accessible name its board gives it. (story: "all screens")

## Permissions and tenancy

Every phone screen shows the signed-in user's own data, through the same API checks as today, and nobody else's. An entry, row or screen shows only to a user who may open it today: Jobs only with the jobs feature, CVs and the new application with CV only with the CVs feature, Reports only with a recorded Borderless BASE or PSP badge, and Admin only to an administrator. The API stays the rule; the phone layout only follows it. An administrator sees nothing extra on another user's applications, sessions, CVs or reports.

The phone or desktop layout depends only on the screen width. It never depends on the account, and it grants or hides nothing beyond what the desktop grants or hides.

## Edge cases

- The screen is rotated or resized across 768 px: the layout switches, an open sheet closes, and a half-filled quick add is lost; the new application with CV keeps its autosave.
- No interview is coming: Today shows no next-interview card. No application has gone quiet: Today says "All caught up."
- The user views an archived cycle: Pipeline and Insights show it read-only; Today's attention list always reads the current cycle.
- A closed application: Reopen only, no Log update and no Close.
- An open application whose latest event is a denial: listed under Closed with "Denied".
- A long company, role or user name: it truncates with an ellipsis instead of breaking the row.
- The user has no first name: the greeting uses the username, and the initials come from it.
- No applications: Pipeline and Insights show today's empty messages in the phone layout.
- The cookie notice covers the tab bar until the user acknowledges it (the owner's earlier choice: the notice floats on purpose).
- A feature is taken away mid-session: its Account row disappears on the next load and its address shows "page not found", as today.
- A membership locked because the Borderless sign-in ended: Reports shows that reason in the closed layout, with "Sign in again".
- A Portuguese label is longer than its English one: tab labels and pills truncate instead of wrapping.
- A device code link opened while signed out: the user signs in and lands on Sign in a device, as today.

## Non-goals

- A native, store or Expo app; a PWA, a web manifest or offline mode. (Q1)
- Any change at 768 px and up, other than the sign-in page. (Q2)
- The screens without a V2 board: the applika-cli page, new CV, the application's CV copy, admin feature detail, admin companies, platforms, supports, users, features and Discord webhooks keep today's content. The "Applika Mobile v3" design (`https://claude.ai/artifact/DGDqMq2kpfuWHixKp7RQuH`, copy in the workspace `design/applika-mobile-v3/`) covers them for a later plan. (Q5)
- Keeping the design file up to date from this plan. New screens get their own design. (Q4)
- Any new API, data or command-line change.

## Success signals

- On a 390 × 844 phone, every boarded screen matches its board side by side, in dark and in light, in English and Portuguese, at the owner's review.
- Desktop screenshots of every screen are unchanged, except the sign-in page, which matches option C desktop.
- A phone user adds an application from Today and finds it in the Pipeline without leaving the tab bar.
- The phone end-to-end run against the real stack passes, together with every existing end-to-end case.

## Assumptions

- Not gated: this redesigns existing screens, which the beta rule leaves ungated. Today's attention list, Insights and the Account hub show existing data in a new place. The owner sees it at sign-off.
- The application screen is the applications address with the application chosen; the desktop keeps expanding that row.
- Pipeline stages come from each application's latest event: none is Applied, an initial screening is Screening, any other interview is Technical, an offer is Offer, closed or denied is Closed.
- Every stale application is listed on Today, most days first.
- Coming up lists the next three interviews after the next one; the Agenda's "Later" lists the next five after the chosen day.
- The Agenda week starts on Monday, as on the board.
- An interview card reads "company · duration"; the board's "video call" has no data behind it and is left out.
- Within a day, time to start reads "in 2h 15m"; beyond a day, it reads the weekday and date.
- History marks a future event "scheduled", a past interview followed by a later event "passed", and any other past event "done".
- Quick add saves the application as one the user applied to (active), and offers the user's platforms as chips, with "Other" opening today's platform picker.
- The new application with CV shows the board's fields first and today's other fields under "More details", so no field is lost; "Edit the CV copy" opens today's CV copy editor.
- The CV editor on a phone shows no live preview; the PDF action covers it.
- The Account hub's theme choice has two options, Light and Dark, like today's toggle; its language labels are "English" and "Português (BR)", as on the board. Its back link returns to Today, as on the board.
- Sign-in keeps today's words under the "Opening Borderless…" button; the board's "Tap again to land back signed in." is a prototype instruction, not product copy.
- Sign-in keeps today's per-reason error messages inside option C's alert, rather than the board's single sample message.
- The CLI announcement banner stays on phones, at the top of the content.
- Revoking a device and deleting a CV or cycle keep today's confirmation, shown as a sheet.
- The Borderless logo comes from the design file and is served with the web app.
- The brief's "Pipeline Stale filter" is not on the board; Stale is a row marker only.
- All work lands on one branch, `labs01-146`, cut from `develop`, in one frontend release with no migration.
