---
PRD: 0012
title: Job board from Ían Muliterno's contribution, with CV fit, keyword tailoring and draft applications
status: Approved
owner: LuisMSoares
created: 2026-10-11
related-adrs: [0001, 0003, 0004, 0005, 0007, 0009, 0010, 0014, 0015, 0016, 0017]
related-prds: [0000-product-vision.md, 0007-cv-builder.md, 0010-application-with-cv-drafts-private-catalogs.md]
---

# PRD 0012 — Job board from Ían Muliterno's contribution, with CV fit, keyword tailoring and draft applications

## In the owner's words

As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution.

## Clarifications

- Q1: How far does tailoring go (PRD 0000/0007 non-goals "ATS scoring", "CV improvement recommendations"; ADR-0007 binds the port to the verbatim clone)? Options were fit + keyword reorder / + ATS warnings / fit only. → A: "Fit + keyword reorder (Recommended)" (fit score 0-100 with matched/missing keywords, plus a heuristic tailor that only reorders skills and bullets of the base CV by job match, no new text, no AI, output is a tailored_cvs snapshot; no ATS warnings).
- Q2: Where does scraping run? → A: "separate service, taskiq worker using redis as broker scheduled to run hourly"
- Q3: Himalayas Cloudflare: official API/RSS only, or keep cloudscraper? → A: "Keep cloudscraper"
- Q4: Revert scope? → A: "Full revert (Recommended)" (the revert undoes all his changes; the rebuild ports his scrapers and Himalayas test with a Co-authored-by trailer).
- Q5: Enhancements in this feature? → A: "Fit on applications, Dismiss + applied marks, Saved searches + Discord alert" (NOT chosen: CLI jobs commands — out of this PRD).
- (2026-10-11) Q: ADR-0007 allows only the verbatim clone binding and lists ATS scoring as a non-goal. Amend it, or drop fit and reorder? → A: "Amend via ADR 0017 (Recommended)" (second deterministic non-AI binding: reorder only, no new text, was_ai_generated=false; narrow non-goal to LLM/rubric ATS scoring and ATS warnings; PRD 0012 lists the PRD 0000/0007 lines it supersedes).
- (2026-10-11) Q: Does keyword tailoring replace the verbatim copy, or is it an opt-in action? → A: "Opt-in action (Recommended)" ('Tailor by keywords' action in the job → draft flow and on the application CV page; verbatim copy stays default).
- (2026-10-11) Q: Where does a saved-search Discord alert go? → A: "ignore this discord alert". Saved searches ship without any notification. The alert is a later feature.

## Problem

Ían Muliterno opened a pull request that adds a remote job board to Applika. It scrapes Himalayas and RemoteOK, scores how well an uploaded CV fits a job, tailors that CV with keywords, and creates an application from a job. His branch was written against an older Applika. Since then, Applika has gained master CVs, per-application CV copies, drafts and private catalogs, so his code cannot land as it is. Copying it by hand would erase his authorship.

The owner wants two things. First, Ían's commits in Applika's history under his name. Second, the feature rebuilt on today's product: master CVs instead of uploaded files, jobs that become drafts, and collection that runs safely in production. Then a user can find a remote job, see how well each of their CVs fits it, and start a tailored application in a few clicks.

## Users and stories

- US1 (P1) The owner sees Ían's commits in Applika's history with his authorship, and the product behaves exactly as before.
- US2 (P1) A signed-in user browses remote jobs from Himalayas and RemoteOK, refreshed every hour, and searches and filters them.
- US3 (P1) A user sees how well each of their master CVs fits a job, as a score with the keywords it matches and misses.
- US4 (P1) A user starts an application from a job. They get a draft filled from the job, optionally with a CV copy from a master CV they pick, either verbatim or tailored by keywords, and finish it in the drafts flow.
- US5 (P2) On an application's CV page, a user makes the copy "tailored by keywords" instead of verbatim, and sees how well the copy fits the job description, also for applications not started from a job.
- US6 (P2) A user dismisses jobs they don't want. Jobs they already started or finished an application for show as such.
- US7 (P2) A user saves a set of filters under a name and applies it again later.
- US8 (P3) An admin sees how each source's last run went, turns a source on or off, and starts a run at once.

## Requirements

History
- R-001 Applika's main development history contains every commit of Ían Muliterno's `job_scrapping` branch, with its original author, date and message. The commits come in through one merge, followed in the same change by one revert that undoes the whole merge.
- R-002 After R-001 the product's code and behaviour equal what they were before it. Nothing from the branch runs, and none of its database changes reaches any database.
- R-003 Every later change that ports logic from his branch names him as co-author. This PRD names his pull request as the origin of the feature.

Collection
- R-004 The system collects remote job postings from Himalayas and RemoteOK once an hour, in a background service apart from the web API. A slow or failing source never slows or fails a user's request.
- R-005 A run takes the postings published in the last 7 days. It adds new ones, updates changed ones, and never stores the same posting of a source twice.
- R-006 Each posting keeps its title, company, company website when given, location, employment type when given, salary text when given, tags, publication date, a link to the original posting, and its description as plain text.
- R-007 A posting leaves the job list 15 days after publication. The system keeps the posting, so applications started from it keep their link.
- R-008 A failing source never stops the other source. For each source, a run records when it ran, whether it succeeded or was blocked, how many postings it found and saved, and the error when it failed.
- R-009 Two runs never overlap. A run started while another one is in progress does nothing.

Job list
- R-010 Every signed-in user sees the job list, newest first, 25 per page. Each job shows its title, company, source, location, employment type, salary text, tags, publication date, and the user's best fit score among their master CVs.
- R-011 The user searches by text (title, company, description), filters by source, tags, minimum fit and "published within the last N days", and sorts by newest or by best fit.
- R-012 The user opens a job and sees its full description, a link to the original posting on its source, and the fit of each of their master CVs with the matched and missing keywords.

Fit
- R-013 The fit of a CV for a job is a whole number from 0 to 100. It is the share of the job's keywords that appear in the CV's text. The job's keywords are its most frequent terms and word pairs, plus its tags. The CV's text is its headline, summary, skill keywords, experience roles and bullets, projects and certifications.
- R-014 Fixed rules compute the fit. The same CV and job always give the same score, and no AI or outside service is involved.
- R-015 A user with no master CV sees no fit on any job, and an invitation to create a master CV.
- R-016 After a user creates or edits a master CV, its fit on every listed job reflects the change, at the latest after the next hourly run. Deleting a master CV removes its fit everywhere.

Starting an application from a job
- R-017 From a job, the user starts an application. The system creates a draft (PRD 0010) filled from the job:
  - role: the job's title;
  - company: the job's company;
  - platform: the job's source;
  - also the link to the posting, the job description, the work mode "remote", and today's date.
- R-018 A company with a website follows the company rules of PRD 0010: the user's own company with the same name and website is reused, otherwise a new company is created, private to the user. A company without a website stays free text on that draft.
- R-019 Each source appears as a platform that every user sees, named after the source.
- R-020 In the same step, the user may pick one of their master CVs and choose a verbatim copy, which is preselected, or "Tailor by keywords". The draft then holds that CV copy, and the user lands on the CV step of the "new application with CV" page.
- R-021 A user holds at most one application, draft or finished, per job. Starting again offers to open the one that exists.
- R-022 The draft follows every rule of PRD 0010: it stays out of reports, statistics and lists, and the user finishes, resumes or deletes it from the Drafts tab.

Tailoring by keywords
- R-023 "Tailor by keywords" first makes the same full copy as the verbatim copy. It then reorders three things by how well they match the job description:
  - keywords within each skill category, matched ones first;
  - skill categories, the ones with more matches first;
  - bullets within each experience entry, the ones with more matches first.
  Ties keep the master CV's order.
- R-024 Tailoring by keywords never adds, removes or rewrites any text. It never reorders experience entries or other sections, uses no AI, and marks the copy as not AI-generated.
- R-025 The copy records what was reordered in each section. The existing comparison with the master CV (PRD 0007 R-023) shows those moves.
- R-026 The verbatim copy stays the default everywhere. "Tailor by keywords" is an opt-in choice, in the job flow and on the application CV page, offered only when the application has a job description.
- R-027 Command-line clients that create a CV copy keep getting a verbatim copy, and keep working unchanged.

Fit on applications
- R-028 The application CV page, for applications and drafts alike, shows the fit of the CV copy against the application's job description, with matched and missing keywords. This holds whether or not the application came from a job. With no job description, the page shows no fit.

Dismiss and marks
- R-029 The user dismisses a job. It leaves their list and stays dismissed until they restore it from a "show dismissed" view.
- R-030 A job the user started an application from shows "Draft" while the draft is open and "Applied" once it is finished, with a link to that draft or application.

Saved searches
- R-031 The user saves the current search, filters and sort under a name. They list their saved searches, apply one to the job list, rename one, and delete one. A user holds at most 10.
- R-032 A saved search sends no notification of any kind.

Administration
- R-033 An admin sees, for each source: whether it is on, when it last ran, how that run ended, how many postings it found and saved, its last error, and how many of its jobs are listed.
- R-034 An admin turns a source off or on. A run skips a source that is off.
- R-035 An admin starts a run at once. The screen says so when a run is already in progress or the background service cannot be reached.

Release
- R-036 Database changes reach production in a release before the code that uses them. Every flow that works today keeps working between the two releases.

## Permissions and tenancy

A signed-in user can see every listed job and the name of every source. A user can dismiss and restore jobs for themselves only. A user's fit scores, dismissals, marks and saved searches belong to that user. No other user sees them on any job screen, and neither does an admin. Another user's saved search is reported as not found. A user can start an application from a job only for themselves. The draft it creates belongs to them alone under the rules of PRD 0010. A company created from the job's website is private to them until an admin publishes it. A user can make a CV copy, verbatim or tailored by keywords, only from their own master CVs and only on their own applications and drafts. Only an admin can see how the sources' runs went, turn a source on or off, and start a run. Being an admin gives no access to another user's fits, dismissals, saved searches, drafts or CV copies. The background service acts for no user. It writes jobs, sources and fit scores, and it never writes an application, a CV copy or a saved search. An anonymous visitor can do none of this.

## Edge cases

- A source is down or blocks the request: that source's run is recorded as failed or blocked, the other source runs, and the list keeps the jobs it had.
- A source drops a posting before 15 days: the job stays listed until 15 days after publication.
- A posting is edited at the source: the next run updates it, and fits for it are recomputed.
- The same job is posted on both sources: it shows twice, once per source.
- The user opens a job that left the list: they see it only if they started an application from it, otherwise "not found". A job that left the list cannot start a new application.
- The user clicks "start application" twice, or in two tabs: one draft is created, and the second attempt offers to open it.
- The user picks "Tailor by keywords" on an application with no job description: the choice is not offered.
- The job's title, company or description is longer than an application allows: it is cut to fit.
- A source's name matches a platform that already exists for everyone, ignoring case: that platform is reused.
- The user deletes the master CV a copy was made from: the copy stays (PRD 0007 R-007), and that CV's fits disappear.
- The user deletes a draft started from a job: the job's mark clears, and they can start again.
- The background service is down: the list shows the last collected jobs, and the admin screen shows the last run.
- An application started from a job is finalized or archived: the job still shows "Applied".

## Non-goals

- Command-line commands for jobs (Q5, not chosen).
- Notifications for saved searches, on Discord or anywhere else. The owner: "ignore this discord alert". This is a later feature.
- Uploading or parsing a PDF or Word CV (Ían's resume upload is not rebuilt).
- ATS warnings, ATS scoring by a model or a rubric, AI or LLM tailoring, rewriting CV text, and improvement suggestions.
- Sources other than Himalayas and RemoteOK.
- Deleting jobs, or any change to a user's data when a job leaves the list.
- Ían's unrelated edits: the GitHub redirect default, the logging filter move, and his agent instruction files.
- Making keyword tailoring the default, or offering it to command-line clients.

## Supersedes

ADR-0017 amends ADR-0007. This PRD supersedes the following lines in part:
- PRD 0000 line 56, "Tailoring is a verbatim copy now; real models connect later behind a port". It still holds for the default copy.
- PRD 0000 line 74, "ATS scoring, CV improvement recommendations". Only keyword fit is now allowed.
- PRD 0007 R-016, "only behaviour today is a verbatim copy". This now applies to the default.
- The PRD 0007 non-goal "ATS scoring, CV improvement suggestions". Only keyword fit is now allowed.

## Success signals

- `git log --author=Muliterno` on the main development line lists Ían's ten commits.
- After picking a master CV, a user goes from a listed job to a draft holding a CV copy tailored by keywords in three clicks or fewer.
- New postings appear in the list within about an hour of their publication on the source.
- A source outage shows on the admin screen and never slows or fails a user's request.
- Installed command-line clients notice no change.

## Assumptions

- Every signed-in user sees jobs. Only admins control sources and runs.
- A job's company with a website goes through the company rules of PRD 0010 and becomes a private company. Without a website it is free text.
- Each source maps to a platform visible to everyone, added by the database change. A visible platform with the same name, ignoring case, is reused.
- The fit on an application scores its CV copy, and the page hides it when the application has no CV copy.
- Jobs leave the list 15 days after publication, and a run looks back 7 days. Both are settings.
- One application per user per job.
- Runs start every hour at minute 0, UTC.
- Pages hold 25 jobs. A user keeps at most 10 saved searches, and their names are unique per user, ignoring case.
- Text search covers title, company and description.
- A draft from a job has work mode "remote", no country, mode "active", and today's date.
- A job with no publication date counts as published when it was first collected.
- The fit of every listed job is refreshed after each run. A master CV save asks for a refresh at once, and the hourly run catches any refresh that was missed.
- "Applied" covers a finished application whatever happened to it later, including closed and archived.
- The history import ships as its own change, at any time, apart from the rebuild.
- No `.mailmap` entry: Ían's commits keep the email addresses they carry.
- The history import gets one backend changelog line ("history import, no behaviour change"), so his credit is visible.
- Each job shows its source's name and links to the posting on that source.
