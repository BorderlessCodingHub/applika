---
PRD: 0013
title: Beta features, with the job board for selected users first and then everyone
status: Approved
owner: LuisMSoares
created: 2026-10-14
related-adrs: [0004, 0016, 0017, 0018]
related-prds: [0004-admin-supports-companies.md, 0012-job-board-fit-and-keyword-tailoring.md]
---

# PRD 0013 — Beta features, with the job board for selected users first and then everyone

## In the owner's words

with the jobs featurw implemented i would like to block this feature under beta features and release only to selected beta users, all mew features in the feature will follow the same pattern, start as beta and then release to everyone

## Clarifications

- Q: How is "beta" modelled? (Feature registry + one is_beta_tester flag / Per-feature allowlist / Config flags in code) → A: "Per-feature allowlist" (registry table plus a user×feature table: each beta feature has its own list of users).
- Q: Who manages beta access and releases a feature, and where? → A: "Admin UI under /admin (Recommended)" (new admin page: list features with stage, add/remove users to a feature's beta list searching by username, 'Release to everyone' action; AdminUserDp; /admin/features routes; no deploy needed).
- Q: What does a user NOT in the beta experience for the job board? → A: "Fully hidden, API enforced (Recommended)" (jobs nav, /jobs pages and every job-related control — start-from-job, fit on applications, tailor by keywords, saved searches — not rendered; backend answers 404 on gated routes as if they didn't exist; admins are NOT auto-included).
- Q: Which parts of PRD 0012 sit behind the `jobs` beta? → A: "Everything from PRD 0012 (Recommended)" (job list/detail, start-from-job, dismiss/applied marks, saved searches, fit on applications and 'Tailor by keywords' on the CV page all gated; hourly scraper keeps running for everyone; admin job-source page stays admin-only, not gated; non-beta users see Applika exactly as before 0012).
- Q: What is a feature's lifecycle once released? → A: "Reversible, list kept (Recommended)" (stages beta ↔ general; releasing keeps the allowlist; moving back to beta re-hides for everyone not on the list; features registered by a migration seed row, new features add their key in their own migration starting in beta; unknown key = treated as hidden).
- (2026-10-14) Owner: "features is granted to admins automatically, but it can also be disabled by them in the admin panel." This replaces "admins are NOT auto-included" in the third answer above.
- (2026-10-14) Q: What exactly can be disabled? → A: "Each admin opts out per feature (Recommended)" (every admin has every beta feature by default; on the feature's admin page an admin can turn it off for themselves only, e.g. to see the app as a normal user, and back on; other admins unaffected; one per-admin opt-out row per feature).
- (2026-10-14) Q: How is Release A cut, given that `develop` already holds the job board code? → A: "Cut 0013-release-a from tag (Recommended)".

## Problem

The job board (PRD 0012) is built and has not reached production yet. The owner does not want every user to get it on the same day. He wants a small group he picks to use it first, and he wants to open it to everyone when he is ready, from the admin area and without a deploy. Admins get every beta feature by default so they can try it, and each admin can turn a feature off for themselves. Every later feature follows the same path: it starts in beta and is then released to everyone.

## Users and stories

- US1 (P1) A user who is neither an admin nor on the job board's beta list sees Applika exactly as it was before the job board. They see no Jobs entry, no job pages and no job controls, and the server answers as if the job board did not exist.
- US2 (P1) A user on the job board's beta list uses the whole job board as PRD 0012 describes it.
- US3 (P1) An admin sees every feature and its stage. They add users to a beta feature's list, or remove them, by searching for a username.
- US4 (P1) An admin releases a beta feature to everyone and can move it back to beta. The beta list is kept both ways.
- US5 (P1) An admin has every beta feature without being on its list. On the feature's admin page they turn it off for themselves only, for example to see the app as a user without it, and back on.
- US6 (P2) A user who has a beta feature can see that it is in beta.
- US7 (P2) A later feature takes the same path. It arrives in beta with an empty list, and nothing else in the product changes for it.

## Requirements

Features and stages
- R-001 The system keeps a list of features. Each feature has a key, a name, a short description and a stage, "beta" or "general".
- R-002 A user has a feature when the feature is general, or when the user is on its beta list, or when the user is an admin who has not turned the feature off for themselves. Nothing else gives a user a feature.
- R-003 The system treats a feature it does not know as hidden from every user, admins included.
- R-004 Every new feature that users who are not admins can see joins the list in beta, with an empty beta list, in the same release that adds it.
- R-005 The job board joins the list as the feature "jobs", named "Job board", in beta and with an empty beta list. From then on every admin has it, and no other user does until an admin adds them.

Administration
- R-006 An admin sees every feature with its key, name, description and stage, how many users are on its beta list, when it was released, and whether they themselves have it. Admins who have a feature only because they are admins are not counted on its beta list.
- R-007 An admin opens a feature and sees its beta list. For each user it shows the username, when they were added and who added them. The list can be searched by username and is split into pages.
- R-008 An admin adds a user to a feature's beta list by searching for their username. Adding a user who is already on the list changes nothing.
- R-009 An admin removes a user from a feature's beta list. Removing a user who is not on the list changes nothing.
- R-010 An admin releases a beta feature to everyone after confirming. An admin moves a general feature back to beta after confirming, and the confirmation says that users who are neither on the list nor admins lose access.
- R-011 Releasing a feature, or moving it back to beta, leaves its beta list unchanged. The list can be edited in either stage. Moving a feature back to beta hides it again from every user who is not on the list, except admins who have not turned it off.
- R-012 A change made on the admin screen applies from the user's next request to the server, with no deploy and no restart. The user's screens catch up on their next page load at the latest.

An admin's own access
- R-013 Every admin has every beta feature without being on its list, unless they turned that feature off for themselves.
- R-014 On a feature's admin page, an admin turns the feature off for themselves, and back on. This changes only what that admin sees. Other admins and other users are not affected, and no admin can turn a feature off for anyone else.
- R-015 That page tells the admin whether they have the feature right now, and why: it is released to everyone, they are on the beta list, they are an admin, or they turned it off.
- R-016 An admin's choice to turn a feature off counts only while the feature is in beta. A general feature is on for everyone, admins included. The choice is kept through a release and counts again if the feature moves back to beta.
- R-017 An admin who is on the beta list keeps the feature after turning it off for themselves, because turning it off removes only the access they have as an admin. The page says so, and tells them to leave the list to hide the feature.

A user without "jobs"
- R-018 A user without "jobs" sees no Jobs entry in the navigation. If they open the job list or a job's page, they see the app's "page not found".
- R-019 On an application's CV page and on a draft's CV step, a user without "jobs" sees no "Tailor by keywords" choice and no CV fit panel.
- R-020 A user without "jobs" who asks the server for the job list, a job, a dismissal, saved searches, a draft started from a job, or an application's CV fit gets "not found". It is the same answer the server gives for an address that does not exist.
- R-021 A user without "jobs" who asks for a CV copy "tailored by keywords" is refused, as if that choice did not exist. A verbatim copy works as it does today.
- R-022 For a user without "jobs", everything else in Applika works exactly as it did before PRD 0012: applications, drafts, CV copies, statistics, reports, agenda and command-line clients.

Outside the gate
- R-023 Job collection keeps running every hour for everyone, as PRD 0012 R-004 says. The system keeps computing fit scores for every master CV.
- R-024 The admin job sources screen stays open to every admin, including an admin who turned "jobs" off for themselves.

A user with "jobs"
- R-025 A user with "jobs" gets all of PRD 0012: the job list and job pages, starting a draft from a job, dismissals and marks, saved searches, the CV fit on applications and "Tailor by keywords".
- R-026 While "jobs" is in beta, a user who has it sees a "Beta" label on the Jobs entry and on the job pages. The label goes away when the feature is released.

Losing and regaining access
- R-027 A user who loses "jobs" keeps everything they made with it: drafts and applications started from jobs, CV copies tailored by keywords, saved searches and dismissals. Their drafts and applications keep working, with no job control shown. If they get "jobs" back, their saved searches, dismissals and marks come back unchanged. This applies just as much to an admin who turns "jobs" off and back on.

Scope of PRD 0012
- R-028 This PRD narrows PRD 0012 R-010 and its assumption "Every signed-in user sees jobs". Only users who have "jobs" see the job list.

Release
- R-029 Database changes reach production in a release before the code that uses them. The job board never reaches production users without this gate.

## Permissions and tenancy

Only an admin can see the list of features, see or change a feature's beta list, release a feature, or move it back to beta. A user who is not an admin can learn only which features they have. They never see another user's access or any beta list. Being on a beta list opens that feature's own screens and actions, and nothing more. It gives no access to another user's data, to the shared catalogs, or to any admin screen. Every admin has every beta feature unless they turned it off for themselves. An admin can turn a feature off, or back on, only for themselves, never for another admin or user, and they see only their own choice. Having a feature as an admin opens the same screens and actions as being on the list, and nothing more. Inside the job board, every PRD 0012 rule about whose data is whose still holds, for admins too: an admin sees only their own fits, dismissals, saved searches and drafts. The background service acts for no user, and it is never gated. An anonymous visitor gets the same answer as today, which tells them to sign in.

## Edge cases

- An admin adds a username that does not exist: refused as "not found".
- An admin adds the same user twice, or two admins add the same user at the same moment: the user is on the list once.
- An admin removes a user while that user has a job page open: their next action there fails as "not found", and the Jobs entry is gone on their next page load.
- A feature is released while a user is on its list: nothing changes for them except that the "Beta" label goes away.
- A feature moves back to beta: users who are neither on the list nor admins lose access from their next request, including users who signed up after the release. Admins who had turned it off lose it again.
- A user is deleted: they leave every beta list, and their choices as an admin go with them.
- An admin stops being an admin: they lose the access they had as an admin and keep only what beta lists give them.
- A user becomes an admin: they have every beta feature from their next request.
- An admin turns a feature off while one of its pages is open: their next action there fails as "not found", and the Jobs entry is gone on their next page load.
- An admin who turned a feature off sees it released: they have it, like everyone else.
- A user who loses "jobs" has an open draft started from a job: they finish it from the Drafts tab, and its CV copy stays as it is.
- A user without "jobs" opens a saved link to a job page: they see "page not found".
- A user without "jobs" asks for a copy "tailored by keywords" from an old browser tab: the request is refused, and the verbatim copy is still offered.
- The code checks a feature before the release that registers it has run: the feature is hidden from everyone, admins included.

## Non-goals

- Rolling out to a percentage of users, random samples, cohorts or groups.
- Users joining or leaving a beta themselves.
- Telling a user that they were added or removed, or that a feature was released.
- Gating features that shipped before the job board, admin-only screens, or bug fixes.
- Turning a feature off for everyone, beta list included.
- An admin turning a feature off for another admin or for a user.
- Plan tiers, paid features, and any role beyond the admin flag (ADR-0004).
- Adding, renaming or deleting features from the admin screen. A feature joins the list with the release that ships it.
- A different stage per environment.
- Command-line commands for features.

## Success signals

- A user who is neither an admin nor on the jobs beta list sees seven navigation entries and no job control anywhere, and the server answers "not found" on every job route.
- An admin sees Jobs without being on the list. After turning it off, they see seven entries on their next page load, and after turning it back on, eight.
- The owner adds a user to the jobs beta in under a minute, without a deploy, and that user sees Jobs on their next page load.
- After a release, every user sees Jobs on their next page load. After the feature moves back to beta, it is hidden again and the beta list is unchanged.
- Installed command-line clients notice no change.

## Assumptions

- "all mew features in the feature" means all new features in the future.
- A "new feature" is a new capability that users who are not admins can see. Changes to existing screens, bug fixes and admin-only screens are not gated.
- The admin screen is a "Features" tab in the admin area.
- Adding a user searches all users by username or email, the same search as the admin users screen.
- Nothing is cached between requests, so a change applies on the next request.
- Users who have a beta feature, admins included, see a "Beta" label (R-026). The story does not ask for it, but it tells beta users what they are using.
- An admin's choice to turn a feature off counts only in beta (R-016). The owner said "disabled by them" without naming a stage, and a released feature is for everyone.
- The beta list wins over an admin's turn-off (R-017). Turning a feature off removes only the access an admin gets by being an admin.
- An admin sees only their own on/off choice, not other admins' choices.
- An admin's turn-off is kept if they stop being an admin, and counts again if they become an admin again.
- An anonymous visitor gets today's sign-in answer on a gated route, not "not found".
- A "tailored by keywords" request without "jobs" is refused as an invalid value, not silently turned into a verbatim copy.
- Fit scores are computed for every user, so a release needs no catch-up.
- The jobs beta list starts empty. Admins, the owner included, have the job board from the release on. The owner adds the first beta users after that.
- The release date is recorded, and moving back to beta clears it. No other history of stage changes or removals is kept.
