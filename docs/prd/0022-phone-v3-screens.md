---
PRD: 0022
title: Phone layout for the v3 screens
status: Approved
owner: LuisMSoares
created: 2026-11-09
related-adrs: [0006, 0011, 0018, 0024, 0025, 0027]
related-prds: [0021-phone-v2-redesign.md, 0010-application-with-cv-drafts-private-catalogs.md, 0013-beta-features.md, 0015-cvs-beta-and-three-event-types.md, 0018-borderless-sign-in-and-membership-badges.md]
---

# PRD 0022 — Phone layout for the v3 screens

## In the owner's words

create a new plan extending the last with the new screns in v3 artifact

## Clarifications

- Q: Where does the new plan's work land? 0021 sits unpushed on branch labs01-146. Its autopilot run finished with the full gate green, and all 5 tickets wait on your phone walk. Your words: "create a new plan extending the last". → A: "Same branch labs01-146 (Recommended)" — option text: "The new tickets commit after 0021's on labs01-146, and one PR to develop carries both. They reuse 0021's phone parts (sheets, chips, groups, top bar) with no rebase, and fixes from your 0021 walk land on the same branch. Frontend only, one release, and the 0021 PR isn't open yet. Cost: a bigger PR, and 0021 can't merge alone. Docs are written in the labs01-146 worktree."
- Q: Does the new plan cover only the 9 new v3 boards, or also the follow-ups the 0021 autopilot report left open? Your words: "extending the last with the new screns in v3 artifact". → A: "Only the 9 new boards (Recommended)" — option text: "Admin users, companies, platforms, features, feature detail, the report webhook sheet, the /cli page, new CV and the application's CV copy. Desktop stays as it is (v3 draws no desktop boards). The 0021 follow-ups stay in the report for a later plan. About 3–4 tickets."

## Problem

PRD 0021 gave every screen with a V2 board a layout made for a thumb. It left nine screens as today's desktop content inside the phone layout: the admin Users, Companies, Platforms and Features lists, a feature's page, the report webhook form, the applika-cli page, the new master CV page and an application's CV copy. On a 390 px phone they show tables that scroll sideways, 28 px icon buttons and dialogs made for a mouse. The owner's "Applika Mobile v3" design copies V2 and draws those nine screens in the same language. This PRD brings them to phones; the desktop stays as it is.

## Users and stories

- US1 (P1) An administrator on a phone finds a user, sorts the list, reads the user's details, and gives or takes away administrator rights.
- US2 (P1) An administrator on a phone filters companies or platforms by visibility, approves a private one, adds, edits or deletes one, and turns a company on or off.
- US3 (P1) A user with CVs picks a master CV for an application on a phone, then reads and edits the application's CV copy, its fit and its changes, and downloads it.
- US4 (P2) An administrator on a phone releases a feature to everyone or moves it back to beta, turns it off for themselves, and adds or removes users on its beta list.
- US5 (P2) An administrator on a phone adds, edits and deletes a report webhook in a sheet, and never sees its full address after saving.
- US6 (P2) A user with CVs writes a new master CV on a phone and watches its live preview.
- US7 (P3) A visitor on a phone reads the applika-cli page and copies a command.
- US8 (P1) A desktop user sees no change on any of these screens.

## Requirements

- R-001 Below 768 px wide, each of the nine screens renders its v3 board's layout, components, spacing, sizes and copy: admin Users, Companies, Platforms, Features, a feature, Report webhooks with its add, edit and delete sheets, the applika-cli page, the new master CV page, and an application's CV copy. (story: "the new screns in v3 artifact"; Q2)
- R-002 At 768 px and up these screens render exactly as they do today. (Q2: "Desktop stays as it is (v3 draws no desktop boards)")
- R-003 No capability is lost on a phone: a field, state or action today's page offers and the board leaves out stays on the phone screen, in the board's style. (story: "extending the last", PRD 0021's "no field is lost")
- R-004 Light and dark both work on every one of these screens, and every word exists in English and in Brazilian Portuguese and follows the language switch. (story: "extending the last", PRD 0021 R-010 and R-011)
- R-005 Every control on these screens is at least 44 px in each direction and carries the accessible name its board gives it. (story: "extending the last", PRD 0021 R-034)
- R-006 The admin Users, Companies, Platforms, Features and Report webhooks sections show their own title and lead as the page heading, above the section chips; Dashboard and Jobs keep "Admin Console". (story: "v3 artifact")
- R-007 Users shows a search, the user count, sort chips Joined, User, Apps, Offers and Denials (pressing the current one reverses its order), and for each user the initials, username, an admin mark, email, when they joined, seniority, their application, offer and denial counts, the administrator toggle and a details action, then pages. (story)
- R-008 A user's details open in a sheet: email, GitHub ID, name, role, company, seniority, location, availability, total, offers, denials and active applications, bio and tech stack. (story)
- R-009 Companies and Platforms show a search, All / Public / Private, the count and an Add action; each row shows its name, a Private mark, its address as a link or a dash, who added it, its applications and its creation date, with Approve on a private row, Edit and Delete. Companies also show active or inactive and a switch that turns the company on or off. Pages follow. (story)
- R-010 Delete is unavailable on a company or platform that applications use, and the reason "Cannot delete: used by applications" sits beside it. (story)
- R-011 Add, Edit, Approve and Delete each open a sheet. Approve says the row becomes public, who added it, and that it cannot be made private again. A refusal shows the server's words inside the sheet. (story)
- R-012 Features lists each feature as a card with its name, stage, description, key, beta users, release date or "Not released", and whether the administrator has it and why; the card opens the feature. An empty list and a failed load each have their message, the failure with Try again. (story)
- R-013 A feature's page returns to Features and shows the name, stage, description, key and release date; Release to everyone or Move back to beta, confirmed in a sheet; Your access, with the reason and the switch "Use this feature myself"; and the Beta list with its count, a search, Add user, and each member's username, email, date added, who added them and Remove, confirmed in a sheet; pages follow. (story)
- R-014 Add user is a sheet that searches every user by username or email and shows each result with an Admin mark and Add, or "On the list"; Done closes it. (story)
- R-015 Report webhooks shows each webhook's label, Edit, Delete, its badges or "No badge, receives nothing", and its masked address, then Add webhook. (story)
- R-016 The webhook sheet asks for the address (on edit it shows the current masked address, and blank keeps it), the badges BASE and PSP as two checkable options with their descriptions, at least one, and an optional label of up to 100 characters; it saves with Save webhook or Save changes. Delete is confirmed in a sheet. The full address is never shown after saving. (story; Q2 "the report webhook sheet")
- R-017 The applika-cli page shows a header with the home link, the language and theme switches and Sign in; the Command line eyebrow, the applika-cli title, the lead and View on PyPI; Install, Sign in with its three modes, Track from your terminal, and Teach your AI assistant, each with its commands and a Copy action that confirms "Copied"; Everything else with View on PyPI; the link back to the home page; and a footer with the cookie policy. (story; Q2 "the /cli page")
- R-018 The new master CV page returns to CVs and shows the Beta mark while CVs are in beta, the title and lead, the sections as an expandable list with each section's description and Identity and contact open first, a live preview of the CV as A4 pages with the page count and the notice that it does not show the final PDF layout, and Cancel and Create CV. (story; Q2 "new CV")
- R-019 A user with three master CVs sees on the new CV page the limit sentence and Back to CVs, and no form. (story)
- R-020 An application's CV copy page returns to that application's screen through a back link named "Application", and shows the Beta mark while CVs are in beta, the title "Application CV", and the application's role and company. (story; Q2 "the application's CV copy")
- R-021 Before a copy exists, the page shows Choose a master CV: each master CV as a choice with its name, last update, name and headline, keywords, counts, and PDF, Markdown, Edit and Delete; a new master CV tile with the slots left; Tailor by keywords when the application has a job description; and Create the CV copy. (story)
- R-022 Once a copy exists, the page shows its source, the job description as read-only, the CV fit with matched and missing keywords, the changes against the source (Show changes, the count, the sections reordered by job match, Download changes as PDF or Markdown, the last-saved note), the sections as an expandable list with a summary each and their Reordered mark, Download PDF, Download Markdown, Delete copy and Save CV copy. (story)
- R-023 A closed application's copy shows "This application is closed." and "Reopen it to edit this CV.", has no Save CV copy and no Delete copy, and keeps every download. A copy viewed in an archived cycle is read-only the same way, with today's words. (story)
- R-024 Each of the nine phone screens has an end-to-end check at 390 × 844 against the real stack. (story: "extending the last", PRD 0021's phone end-to-end run)

## Permissions and tenancy

The admin screens open only for an administrator, as today: the page guard sends anyone else away, and the API refuses every admin call from a user who is not an administrator. An administrator acts on another user's account only where today's admin pages already allow it, which is the administrator flag and a feature's beta list, and sees no one's applications, CVs or CV copies there.

The new master CV page and the CV copy page open only for a user who has the CVs feature, and each shows and changes only the signed-in user's own master CVs and the copy of the signed-in user's own application. Without the feature they show "page not found" and send no CV request, as today. The applika-cli page is public and holds no account data.

The phone or desktop layout depends only on the screen width. It never depends on the account, and it grants or hides nothing beyond what the desktop grants or hides. The API stays the rule.

## Edge cases

- The screen crosses 768 px with a sheet open: the sheet closes and a half-filled form in it is lost; an unsaved new master CV is lost too, as on the CV editor.
- A long username, email, company, platform, label or feature name truncates with an ellipsis instead of breaking the row or scrolling sideways.
- A search with no match: the list says so in the screen's own words; a cleared search shows the full list at once.
- An approve that would duplicate a public row: the sheet stays open with the server's words naming the existing row.
- An administrator on a feature's beta list: Your access is locked on, with today's reason; a released feature locks it as well.
- A feature key that does not exist, or no key: the page says the feature is not found.
- A webhook carried over with no badge: its card says "No badge, receives nothing", and Save stays refused until a badge is chosen.
- The clipboard is blocked on the applika-cli page: no "Copied", and the commands stay selectable.
- A signed-in visitor on the applika-cli page: the header offers Dashboard instead of Sign in.
- The application has no job description: no Tailor by keywords and no fit, and the copy page offers today's way to add one.
- The master CV a copy came from was deleted: the copy says "source CV deleted" instead of "Copied from", and Show changes uses the saved snapshot or is absent, as today.
- The application id is missing, or the application is not in the viewed cycle: today's messages, in the phone layout.
- A Portuguese label longer than the English one: chips and pills scroll or truncate instead of wrapping.

## Non-goals

- Any change at 768 px and up. (Q2)
- The follow-ups the 0021 autopilot report left open; they wait for a later plan. (Q2)
- Any API, data, migration or command-line change.
- The V2 screens PRD 0021 already built, other than Report webhooks, which v3 redraws.
- `/admin/supports` and `/admin/discord-webhooks`: they are redirects with nothing to show.
- Editing the design file. New screens get their own design (PRD 0021 Q4).

## Success signals

- On a 390 × 844 phone, each of the nine screens matches its v3 board side by side, in dark and in light, in English and in Portuguese, at the owner's review.
- Desktop screenshots of the nine screens are unchanged.
- An administrator approves a private company on a phone without a sideways scroll.
- The phone end-to-end run against the real stack passes, together with every existing end-to-end case.

## Assumptions

- Not gated: these are changes to existing screens and admin-only screens; the CV screens keep their existing CVs gate and Beta mark.
- One branch, `labs01-146`, after 0021's commits; one frontend release with 0021; no migration.
- Report webhooks takes the whole v3 board, not only its sheet: the cards (label, Edit and Delete as icon buttons, Badges and Webhook rows) and the heading "Report webhooks" replace the V2 cards and "Admin Console" on that section.
- A feature's page draws no admin chips and no "Admin Console": the board shows only the back link to Features and the System pill.
- The applika-cli page keeps the language and theme switches in its header, as the phone landing page has them (PRD 0021 Q3: keep the toggle where it exists today); the board's header draws only the logo and Sign in.
- The pages control shows only when there is more than one page, as today.
- A user's details sheet omits an empty field, except email and GitHub ID, which show a dash, as today.
- The joined date and the dates on cards use today's admin formats, not the board's sample words.
- A beta list longer than one page keeps today's 25 per page under the list.
- The job description on the copy page shows four lines with "Show more" for the rest, so no text is lost.
- "Downloads reflect the last saved version." shows at all times on a phone, as the board draws it.
- Delete on a used row is announced as unavailable but stays focusable, so its reason can be read.
- The master CV choices are plain radio buttons with their actions beside them, never inside the choice.
- The new master CV page's preview is today's live preview at the board's sheet width of 210 px.
- The copied commands stay today's, so a copy gives the same text at both widths.
- Each board's words are the English words; where today's English already says the same thing, today's words stay.
