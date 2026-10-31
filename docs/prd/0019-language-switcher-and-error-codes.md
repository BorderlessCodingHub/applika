---
PRD: 0019
title: English and Portuguese, a language switcher, and numbered API error codes
status: Approved
owner: LuisMSoares
created: 2026-10-31
related-adrs: [6, 9, 15, 18, 19, 24, 25]
related-prds: [0006-visual-identity.md, 0013-beta-features.md, 0018-borderless-sign-in-and-membership-badges.md]
---

# PRD 0019 — English and Portuguese, a language switcher, and numbered API error codes

## In the owner's words

Today Applika is available in just one language - english - and I want to expand to english and portuguese, access this website and implement the same language switcher https://platform.borderlesscoding.com/ to this app.

## Clarifications

- Q (2026-10-31): What gets translated into Portuguese? (options offered: user screens + API errors with admin excluded / everything, admin too / screens only, API stays EN; CLI, Discord notifications and user-typed content stay as they are under every option) → A: "screens only, admin included. The api, for each error, return an error code with the message in english, each code translates to a specific error, create a document in the docs listing every error in the application with code and description of this error. The frontend will use this error and determine which languague preference the user is using to display the message in english or portuguese, the translations will be located in frontend only, the api only returns the error code"
- Q (2026-10-31): Where is the chosen language saved? → A: "Browser cookie, like the site (Recommended)" — the switcher writes a NEXT_LOCALE cookie (1 year, path /), as the reference does; works signed out on landing and login; no migration, no new API; a new browser/device starts on the default again.
- Q (2026-10-31): Which language does a first-time visitor see, before touching the switcher? → A: "Detect the browser language (Recommended)" — no cookie: a browser set to pt-* gets pt-BR, anything else en; once the user picks, the cookie wins. Accepted cost: a Portuguese visitor may see English for a moment while the static page loads.
- Q (2026-10-31): Does the language switcher start in beta (`.claude/rules/beta-features.md`)? → A: "No gate, everyone at once" — the owner waives the beta rule for this feature; everyone gets the switcher on every page at deploy. The API error codes are not user-facing and ship ungated regardless.
- Q (2026-10-31): What does an error code look like? (`detail` stays the English string it is today because the published CLI reads it; `code` is added next to it) → A: "Numbered code" — e.g. {"code": "APP-1004", "detail": "Application not found"}: grouped by area with a number, short and stable; meaning lives in the docs table; numbers allocated per area.
- Q (2026-10-31): ADR-0024 §6 and its As-built note pin six named codes (`badge_required`, `membership_unconfirmed`, `email_unverified`, `binding_conflict`, `email_ambiguous`, `email_unusable`). What happens to them? → A: "Renumber them, amend ADR-0024 (Recommended)" — ADR-0025 (Proposed) amends ADR-0024 §6 and its As-built note; the six become numbered codes, and the web moves to them in the same release.
- Q (2026-10-31): ADR-0018, ADR-0015 and ADR-0019 pin the bodies of the hidden-feature 404, the 429 and the session 503. Do they get a code? → A: "Add codes, note it in ADR-0025 (Recommended)" — `detail` stays unchanged; the hidden-feature 404 and the unknown-route 404 share one code, so they stay byte-equal; ADR-0025 records an additive note on all three.
- Q (2026-10-31): Some messages name a value (a wait in seconds, a count, a report day, the name of a conflicting platform or public row). How does the translated message get it? → A: "Optional params on those codes (Recommended)" — only those codes also send `params`, e.g. {"code":"CAT-2002","detail":"…","params":{"name":"LinkedIn"}}; the web writes the sentence in both languages; the error doc lists the params per code.
- Q (2026-10-31): The reference's landing look does not work in light theme. Which look goes on the landing header? → A: "Port both, use default (Recommended)" — both variants ported exactly, and the landing header mounts `default`.
- Q (2026-10-31): How are request-validation 422 errors coded? → A: "One code for all validation (Recommended)" — GEN-1003 for every request-validation 422, the `detail` list unchanged, one translated line on the web.
- Q (2026-10-31): One feature or two? → A: "One feature, 5 tickets, one release (Recommended)" — T1 to T5 as in the plan's Scope, on one integration branch, no migration.
- Q (2026-10-31): Does text the API produces as data (keyword reorder descriptions, device names, a job source's last error, the CV preview and its PDF and Markdown exports) get translated? → A: "Stays English (Recommended)".
- Q (2026-10-31): The unhandled 500 becomes JSON, so the CLI prints "Internal Server Error" instead of "API request failed with status 500". Keep it? → A: "Accept the new CLI text (Recommended)" — the 500 stays {detail: "Internal Server Error", code: GEN-1005} like every other error; the CLI prints "Internal Server Error"; nothing breaks; R-022 gets this one exception; `cli/CHANGELOG.md` records it under Changed.

## Problem

Applika speaks only English. The owner wants every screen in English and in Portuguese, switched with the same control the Borderless platform uses. Today the API's English error sentences go straight onto the screen. A Portuguese screen would still show English errors unless the web can tell which error it received. Nobody can look up what an error means without reading the code.

## Users and stories

US1 (P1) A visitor or a signed-in user switches between English and Portuguese from the page they are on, with the Borderless platform's switcher, and the whole screen follows at once.
US2 (P1) A first-time visitor whose browser prefers Portuguese sees Portuguese without touching anything. Every other first-time visitor sees English.
US3 (P1) The chosen language stays on that browser for a year, signed in or not, on every page.
US4 (P1) An error from the API reaches the user in the user's language.
US5 (P2) An admin works through the admin area in the chosen language.
US6 (P2) Someone reading an error code looks it up in one document and learns which error it is.
US7 (P3) A user of the command-line tool, whatever version they run, keeps working as before. The only visible change is the wording of an unhandled server error.

## Requirements

- R-001 The system offers two languages, English and Portuguese (Brazil). English is the default. (owner: "expand to english and portuguese")
- R-002 The system shows the Borderless platform's language switcher, ported whole: one pill-shaped single-choice group named "Toggle language", with two options in this order: "EN" with the United States flag, named "English", and "BR" with the Brazil flag, named "Português". The group is disabled while a change is in progress. (owner: "implement the same language switcher")
- R-003 The switcher keeps both looks the reference has, the default look and the landing look, each with the reference's exact styling. (owner: "the same language switcher")
- R-004 The switcher sits in the signed-in header on every protected page and in the header of the landing and cookie policy pages. It also sits on the sign-in page and the terminal code page. It uses the default look everywhere, the landing page header included, in both themes. The landing look is ported but not mounted. (owner: "implement the same language switcher to this app"; clarification 9)
- R-005 Choosing a language changes every text on the current screen at once. The user stays on the page, and what they typed stays. (owner: "the same language switcher")
- R-006 The system saves the choice in a browser cookie named NEXT_LOCALE, for one year, valid for every path, signed in or not. Nothing is stored on the account. (clarification 2)
- R-007 With no saved choice, a browser whose preferred languages include any Portuguese variant gets Portuguese (Brazil), and every other browser gets English. A saved choice always wins over the browser setting. (clarification 3)
- R-008 The page declares its language (`en` or `pt-BR`) to the browser and to assistive technology, and updates it when the user switches. (owner: "expand to english and portuguese")
- R-009 Every text on every screen is translated, admin screens included: headings, labels, buttons, menus, hints, empty and error states, toasts, dialog text, and accessible names and descriptions. (clarification 1: "screens only, admin included")
- R-010 Dates, times and numbers on screens are written the way the chosen language writes them. (clarification 1)
- R-011 Every error answer from the API carries a code next to its English message. The English message, the status and the headers stay exactly as they are today. The one exception is an unhandled server error: today it answers plain text, and it now answers in the same shape as every other error, with the same words. (clarifications 1, 5 and 13)
- R-012 A code is an area prefix and a four-digit number, for example APP-1004. Codes are grouped by area and numbered per area. Once shipped, a code is never reused, renumbered or given another meaning. (clarification 5)
- R-013 Each code stands for exactly one error, and each error has exactly one code. (clarification 1: "each code translates to a specific error")
- R-014 The six named codes from ADR-0024 (the sign-in and report refusals) become numbered codes like every other error, and their English messages stay. (clarification 6)
- R-015 The unknown-route 404, the hidden-feature 404, the too-many-requests 429 and the session-service 503 carry a code too, with their English messages unchanged. The hidden-feature 404 stays identical to the unknown-route 404, code included. (clarification 7)
- R-016 A document in the product docs lists every error code with its HTTP status, its English message and a description of the error. (clarification 1)
- R-017 The web shows each error in the user's language by looking up its code. The translations live in the web only. (clarification 1)
- R-018 When the web meets a code it does not know, it shows the API's English message. When there is no message either, it shows a generic line in the user's language. (clarification 1)
- R-019 Some of today's messages name a value: a wait in seconds, a count, a report day, or the name of a conflicting platform or public row. Only these codes also send the named values as params next to the code. The web writes the whole sentence in either language with those values, so the value still shows. The error document lists the params of each such code. (clarifications 1 and 8)
- R-020 Every request the API refuses for invalid input (a validation error) carries the same single code, GEN-1003, and keeps today's list of field errors unchanged. The web shows one translated line for it. (clarification 1: "for each error, return an error code"; clarification 10)
- R-021 Text the API produces as data, rather than as an error message, stays English in both languages and is shown as the API sends it. This covers the keyword reorder descriptions, device names such as "Chrome on macOS", a job source's last error, and the CV preview with its PDF and Markdown exports. The preview stays a twin of the English PDF. (clarification 1: "the api only returns the error code"; clarification 12)
- R-022 Every published version of the command-line tool keeps working, and every route, status, field and message it reads today stays, with one exception. On an unhandled server error, the tool now shows "Internal Server Error" where it used to show "API request failed with status 500". (clarification 5: "`detail` stays the English string it is today because the published CLI reads it"; clarification 13)
- R-023 The cookie policy page lists the language cookie, what it holds and how long it lasts. (clarification 2)
- R-024 Everyone gets the switcher and both languages at once on release, with no beta stage and no allowlist. (clarification 4)
- R-025 The calendar file's event title follows the chosen language. The event's identity inside the file does not change, so a re-import still updates the same calendar entry. (clarification 1)

## Permissions and tenancy

The language choice belongs to the browser, not to an account. Anyone, signed in or not, may switch the language on any page they can already open. The choice changes nothing for anyone else, and nothing on the server. No route is added and no permission changes. An error code is added only to answers the caller already receives, and it reveals nothing that the English message did not already say. The hidden-feature 404 stays identical to an unknown route, code included, so a code never reveals that a beta feature exists. Admin screens stay admin-only, and translating them grants nothing.

## Edge cases

- Cookies blocked: the switch applies to the current page view only, and the next load falls back to browser detection.
- A cookie holding any value other than `en` or `pt-BR`: ignored, and browser detection decides.
- A browser set to `pt`, `pt-PT` or `pt-BR`: Portuguese (Brazil).
- A switch while a form is half filled or a request is in flight: the typed values stay, and the request's answer shows in the new language.
- Two open tabs: the other tab follows on its next page load.
- A Portuguese visitor's first paint shows English for a moment while the static page loads (accepted, clarification 3).
- A browser still running the previous web release while the API is already updated: renumbered codes are unknown to it, so it shows the English message, as it does today.
- Longer Portuguese labels at narrow widths (320px): no sideways scroll, and the header still fits the switcher.
- User content (names, notes, CV text, company names, emails) is never translated.

## Non-goals

- Translating the command-line tool, the Discord report and feedback posts, or anything a user types.
- Any language other than English and Portuguese (Brazil). A language in the URL. Saving the language on the account or across devices. Detecting the language on a server.
- Changing the API's English messages, statuses or headers.
- A language section on the profile page. The reference also has a settings block; the story names the switcher.
- Translating page titles, meta descriptions, social previews or search data.

## Success signals

- In Portuguese, no screen shows English text other than user content, product names, the switcher's endonyms and the exceptions under Assumptions.
- Every error code the API can return appears in the error document and has a message in both languages; a check fails the build otherwise.
- Switching language takes effect on the current screen with no reload, on the landing page, the sign-in page and a signed-in page.
- The command-line tool's own test suite passes with no change.

## Assumptions

- The cookie is written only when the user picks a language. Until then, browser detection decides on every load. (clarification 3: "once the user picks, the cookie wins")
- The page's declared language is set in the browser after load. The static page starts as English.
- Page titles, the meta description, Open Graph data and structured search data stay English, because they are fixed when the site is built.
- Dates and numbers follow the chosen language. The places that force English formatting today stop doing so.
- In the calendar file, the event title (SUMMARY) follows the language, and the event identity (UID) keeps its legacy label.
- Discord posts stay English.
- Placement: in the signed-in header next to the theme toggle on every protected page, at every width (the welcome and device-approval pages included, since they render in the signed-in shell); in the landing header, which the cookie policy page shares; and in a slot of their own on the sign-in page and the terminal code page, neither of which has a header. Visible at every width, with no sideways scroll at 320px.
- The agents write the Portuguese (Brazil) text from a glossary kept in the plan, and the owner reviews it.
- The cookie policy page lists NEXT_LOCALE as a preference cookie that the user sets by choosing a language.
- No beta gate. This is an owner exception to ADR-0018 ("No gate, everyone at once"). ADR-0025 records it in its "Beta exception" decision, and a dated note goes on ADR-0018 once the owner accepts ADR-0025.
- The switcher's endonyms ("English", "Português") and short labels (EN, BR) are never translated, as in the reference.
- Product and brand names stay as they are: Applika, Borderless, BASE, PSP, GitHub, Discord.
