---
PRD: 0011
title: Agenda tabs rework and API rate limiting
status: Approved
owner: LuisMSoares
created: 2026-09-26
related-adrs: [0002, 0006, 0009, 0010, 0012, 0015]
related-prds: [0008-steps-as-timeline.md]
---

# PRD 0011 — Agenda tabs rework and API rate limiting

## In the owner's words

i want to remake the agenda page using this image as reference @docs/refs/agenda-rework.png two tabs - upcoming and past - upcomming first and active by default, the tab content, make as is in the image, that calendar button keep the current behavior that creates a calendar file. I also want to implement pagination to agenda and applications list in this plan, by default the first page fetches the first 20, implement infinite scroll

## Clarifications

- Q: With 20 per page, where do applications filters run? → A: "Server-side (Recommended)". Void: the next answer superseded it and dropped pagination.
- Q: How does the paginated contract ship (GET /applications is used by applika-cli 0.1.4)? → A: "drop pagination change for agenda and applications, instead, let's implement a rate limiter to the api using redis, currently we dont have any." This supersedes the pagination sentence of the story.
- Q: Rate limiter: who is counted and where does it apply? → A: "Per user, per IP fallback (Recommended)". Authenticated requests are counted per user id. Unauthenticated ones (/auth/*, OAuth callbacks, health excluded) are counted per client IP. One global default limit applies on every route, with a stricter limit on /auth/*. It is fair with shared IPs, and it needs the real client IP behind the swarm proxy (X-Forwarded-For trust).
- Q: Rate limiter numbers and behaviour on limit → A: "Config defaults + 429 (Recommended)". Defaults come from settings/env (e.g. 120 req/min per user or IP, 10 req/min on /auth/*) and can be tuned without a release. Over the limit: 429 with Retry-After and X-RateLimit-* headers. If Redis is down, requests pass (fail open) and a warning is logged. The CLI changelog notes 429 as a new possible response.
- Q: Agenda data: range and order for tabs → A: "Keep window, client-side (Recommended)". It keeps the same /users/me/agenda call and ±30-day window. The client splits the list into Upcoming (soonest first) and Past (most recent first), and filters by search (company/role) and stage (interview type). Counts reflect the filtered lists. The agenda needs no backend change.
- (2026-09-26) Q: Where does the external-link icon in the note row land (R-011)? → A: "Applications, focused (Recommended)". `/applications?focus=<id>` opens the list with that application expanded and scrolled into view. An application of an archived cycle falls back to the plain list plus a notice.
- (2026-09-26) Q: What does the chevron reveal (R-012)? → A: "Read-only timeline (Recommended)". It shows that application's timeline, read-only, loaded only when the card opens.
- (2026-09-26) Q: Does the sound-alert bell stay, and where (R-013)? → A: "Button on Upcoming cards (Recommended)". It becomes a square button beside the calendar button, on Upcoming cards only.
- (2026-09-26) Q: Which proxy sits in front of the API in production (R-022)? → A: "I'll name it (Recommended)", then: "this app runs in a vps with traefik". The trusted proxy is Traefik on the VPS swarm. At deploy the owner sets the trusted-proxy setting to the subnet of the network Traefik uses to reach the API. Until then, the /auth/* limit ships raised (e.g. 600 per minute).
- (2026-09-26) Q: Stage pill text: the image's "Interview - Initial screening" or the app's "Interview · Initial screening"? → A: "Hyphen everywhere". The shared stage label uses " - " everywhere. The owner accepts that the calendar file's title and file name text, the dashboard tooltips and the timeline labels change with it. The calendar button still downloads a calendar file as today.
- (2026-09-26) Q: Should the calendar file's event ID keep the old "·" label so re-imports don't create duplicate calendar entries? → A: "Keep old UID (Recommended)". The event ID is built with the old "·" stage text, while the visible title and file name use the hyphen (R-027). Re-importing a pre-release file updates the existing entry.
- (2026-09-27) Q: Installed applika-cli versions delete the stored session when /auth/refresh answers 429 (any non-200 clears it), so the user has to log in again. How do we handle that? → A: "Fix in a new CLI version". A new CLI release treats a 429 on refresh as temporary and keeps the session. Old versions still log out.

## Problem

Today the agenda page stacks four sections (Today, Tomorrow, Upcoming, Past) one after the other.
The user scrolls through past interviews to reach the next one and cannot search or filter. The
owner drew the page he wants in `docs/refs/agenda-rework.png`. It has two tabs, a search, a stage
filter, and interviews grouped by date in rich cards.

The API accepts any number of requests from anyone. A runaway script, a looping client or a
guessing attack on sign-in has nothing to slow it down. Redis is already part of the stack, and
the owner chose to use it for a limiter instead of paginating lists.

## Users and stories

- US1 (P1) A user opens the agenda and sees upcoming interviews first, grouped by date, soonest first.
- US2 (P1) A user opens the Past tab and sees interviews already held, most recent first.
- US3 (P1) A user downloads a calendar file for an interview from its card, as today.
- US4 (P2) A user narrows the agenda by company or role text and by interview type, and each tab's count follows.
- US5 (P1) A client that sends too many requests in a minute is refused and told when to retry.
- US6 (P1) A web or CLI user who stays under the limit notices no change.
- US7 (P2) The owner changes the limits, or turns the limiter off, without a release.
- US8 (P2) A user of the new CLI version whose session refresh is refused stays logged in and runs the command again after the wait.

## Requirements

Agenda (web):

- R-001 The web agenda page follows `docs/refs/agenda-rework.png` element by element, in the current visual identity, in light and dark themes.
- R-002 The page header shows a calendar icon tile, the title "Agenda" and the subtitle "Your application steps organized by date", with a search field ("Search applications...") and a stage filter ("All stages") on the right.
- R-003 The page shows two tabs, Upcoming then Past. Upcoming is selected every time the page opens.
- R-004 Each tab shows how many interviews it lists after the search and the stage filter.
- R-005 The system lists under Upcoming the agenda interviews that have not started yet, soonest first. It lists under Past those that have started, most recent first. An interview with no start time stays upcoming until its day is over.
- R-006 Each tab groups its interviews by date. Each group has a header bar with the date and the number of interviews on that date.
- R-007 Each interview card shows the start time in bold and the end time muted in a left column. It also shows a company tile, the company name, the role, and a line with the date, the time range and the readable time zone. On the right it shows a stage pill, a square calendar button and a chevron. Inside the card, a nested row shows a document icon, the interview's note and an external-link icon.
- R-008 The calendar file for an interview is built as the agenda builds it today. Only the stage text in the file's title and file name follows R-027. The event's identity inside the file stays exactly as it is today, so importing it again updates the same calendar entry.
- R-009 The search keeps the interviews whose company name or role contains the typed text, ignoring case.
- R-010 The stage filter offers "All stages" and each interview type, and keeps only the interviews of the chosen type.
- R-011 The external-link icon in the nested row opens the applications list with that interview's application expanded and scrolled into view. When the list being shown does not hold that application (for example, it belongs to an archived cycle), the list opens as usual and a notice says the application is not in the current cycle.
- R-012 The chevron opens and closes, under the card, that application's timeline in read-only form. The timeline loads only when the card is opened. Cards start closed.
- R-013 The per-interview sound alert (30, 15 and 5 minutes before) stays. A square button beside the calendar button turns it on and off, on Upcoming cards of interviews that have a start time. Past cards show no alert button.
- R-014 The agenda reads the same interviews, over the same window of 30 days before and after today, as it does today.
- R-015 Each tab shows an empty state when it has nothing to list. The message says whether the tab is empty or the search and filter left nothing.

API rate limiting:

- R-016 The system counts every API request against the signed-in user when the request carries a valid session, and against the client's IP address otherwise.
- R-017 The system allows, by default, 120 requests per minute per user or IP address on every route outside sign-in and session routes (/auth/*), and 10 per minute on /auth/*. The two are counted separately.
- R-018 The system refuses a request over the limit with 429, without doing anything the request asked. The answer carries a message that says when to retry, a Retry-After header with the seconds left in the window, and X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset headers.
- R-019 The system sends the X-RateLimit-* headers on every counted answer, and the web app can read them and Retry-After across origins.
- R-020 The system reads both limits, the window and an on/off switch from its configuration, so the owner changes them with a restart and no release.
- R-021 The system lets requests through and logs a warning when Redis is unreachable.
- R-022 The system takes the client's address from the forwarded header only when the request comes through a proxy the owner configured as trusted (in production, the owner's Traefik). Otherwise it uses the direct connection address.
- R-023 The system does not count browser preflight requests.
- R-024 The web app treats a 429 on session refresh as temporary, keeps the user signed in and tries again after the wait.
- R-025 The web app shows the server's retry message in its usual error notice when any other request is refused.
- R-026 No route, request field or response field changes. The backend and CLI changelogs record 429 as a new possible answer on every route.

Stage label (web):

- R-027 The web app names every stage with a spaced hyphen between the event type and the interview type, for example "Interview - Initial screening". This applies everywhere the shared stage label appears: the agenda pill, the header agenda dropdown, agenda alerts, dashboard chart tooltips, timeline event action names, and the calendar file's title and file name. The calendar event's identity keeps the old "·" stage text (R-008). Other separators stay as they are, such as the dot between a time range and its zone and between CV keywords.

CLI (new version):

- R-028 A new `applika-cli` version keeps the stored session when its automatic session refresh is refused with 429, and the command fails with the server's retry message. Every other refresh failure still ends the session, as today. No command, flag or output of earlier versions changes.

## Permissions and tenancy

A user sees on the agenda only the interviews of applications they own, as today. The calendar
file and the application link cover only those interviews.

A signed-in user's requests count only against that user's own quota. The quota is shared by all of
the user's tabs, devices and CLI sessions, and it never mixes with another user's, even when both
use the same IP address. Requests without a valid session share the quota of their IP address.
Admins are counted like every other user and get no exemption. Nobody can read or reset another
user's count. The counters hold only a user id or an IP address and a number, and they expire when
their window ends.

## Edge cases

- An interview today whose start time has passed moves from Upcoming to Past the next time the agenda refreshes.
- An interview whose time zone differs from the viewer's is shown in the viewer's local time, and its own zone is named on the card.
- An interview without an end time shows only its start time. One without a start time shows "All day".
- Both tabs are empty: each shows its empty state with the link to Applications.
- The search empties the selected tab while the other tab still has matches: the other tab's count shows them.
- Two interviews of the same application on one date: two cards under one header.
- A long company name, role or note wraps or truncates without pushing the buttons off the card.
- A user at the limit in the web app is also refused in the CLI until the window ends.
- Two users behind one office IP address, both signed in: each has their own quota. On the sign-in page, before either has a session, they share the IP's /auth/* quota.
- Redis restarts mid-window: counts start again from zero.
- A client that keeps sending while refused gets 429 until the window ends. Its refused requests do not push the end of the window back.
- Across a window boundary, a client can send up to twice the limit within one minute.
- `applika-cli` 0.1.4 over the limit prints the server's message and the command fails. Running it again after the wait works.
- Installed `applika-cli` 0.1.4, 0.2.0 and 1.0.0 whose automatic session refresh gets a 429 delete the stored session and ask the user to log in again. Only the new version keeps it.
- With the new CLI version, a refresh refused with 429 leaves the session stored. Running the command again after the wait refreshes and succeeds.
- A user who imported an interview's calendar file before this release and imports the new file afterwards gets the same calendar entry updated, not a second one, and it now shows the hyphenated title.
- The chevron is opened on an interview whose application has no other events: the timeline shows this interview alone.
- The external link targets an application deleted since the agenda loaded: the list opens with the not-in-cycle notice.

## Non-goals

- Pagination and infinite scroll of the agenda and the applications list (dropped by the owner).
- Any change to the agenda API, its window or its fields.
- The agenda dropdown in the header and the notification logic behind it, apart from the stage label text (R-027).
- Limits per route beyond the two buckets, per-user tiers, and exemptions.
- Waiting or retrying on its own in `applika-cli` after a 429, on session refresh or any other request. The new version only keeps the session (R-028).
- Changing installed `applika-cli` versions. They keep logging out on a refused refresh.
- Protection against floods at the network edge.

## Success signals

- The owner compares `/agenda` with `docs/refs/agenda-rework.png` and finds every element in place.
- No user reports losing the calendar download.
- After release, 429s in the request log come only from clients above the limit, and no signed-in web user is signed out by one.
- `applika-cli` users under the limit report no change.
- A Redis outage does not take the API down.

## Assumptions

- Card times are shown in the viewer's local time, converted from the interview's zone as today. The zone is shown readable (underscores as spaces).
- The nested row's text is the interview's note (observation). With no note it reads "No notes" in muted text, and the link stays.
- The date header counts the interviews on that date and labels them "application" or "applications", as the image does.
- Interviews are grouped by their own date.
- The urgency colour dot on today's cards is dropped because the image has none.
- The stage filter lists the seven interview types, because the agenda holds interviews only.
- The selected tab, the search and the filter are not remembered across visits and are not in the URL.
- The not-in-cycle notice reads "This application is not in the cycle you are viewing." It is shown once, and the address loses its focus part after use.
- Empty tab texts: "No upcoming interviews", "No past interviews in the last 30 days", and "No interviews match your search" when the search or filter emptied the tab.
- Requests to /auth/* count only toward the /auth/* limit, not the general one.
- Counting uses fixed one-minute windows.
- A request with an expired or invalid session counts against its IP address.
- The API documentation routes count under the general limit. No health route exists today, so nothing else is exempt.
- The limiter is on by default in production. Automated test suites and local stacks turn it off or raise it.
- The refusal message is in English, like the rest of the API.
- The new CLI version does not wait for Retry-After or retry on its own. It keeps the session, prints the server's message and exits with an error, like any other refused request. This is the smallest change that keeps users logged in.
- The web app, the API and the new CLI version ship in one release. None needs a database migration.
