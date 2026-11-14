---
PRD: 0016
title: Close an application with an event, and the original teal palette
status: Approved
owner: LuisMSoares
created: 2026-10-19
related-adrs: [0004, 0006, 0009, 0012, 0020, 0022]
related-prds: [0006-visual-identity.md, 0008-steps-as-timeline.md, 0015-cvs-beta-and-three-event-types.md]
---

# PRD 0016 — Close an application with an event, and the original teal palette

## In the owner's words

when i add an event of type offer or denied, the application isn't finalized just as in the close button with a "flag" icon, what i want is, when the user clicks in this close button, i want to display the same dialog used to add a new event to the timeline but displaying only none, offer and denied types and when creating an event with type offer and denied, the application must be finalized (the none type only appear when the user clicks in the flag button sice we dont have an event type for this, it only serves to close the application without an offer and/or a denied). The second thing and no much important is to restore the visual identify from blue to green (as was originally)

(2026-10-19, addendum) there is something i want to add, what i really what is to remove the dialog that opens when i click in the "Close" button and in the same place, display the dialog component when i click to add a new event, BUT, the interview event type only will appear when i click in the button to add a new event, and the "None" option to close an application without offer and denied only appears when i click in the flag button to close. Just one component for both uses

## Clarifications

- Q: Should an offer or denied event close the application only when it's created from the flag button's dialog, or every time one is created? → A: "i want a checkbox - that is checked by default - this checkbox tells that opon creation this this event type, the job application will be closed automatically, the user can uncheck this checkbox to keep the application open (put this checkbox just before the submit button), add a parameter to the cli "--keep-open" when the user creates an event of type offer and denied, if this parameter was used during interview type, just ignore."
- Q: Which green should replace the blue? → A: "Full original palette"
- Q: In the flag button's dialog, which type is selected when it opens, and does the close checkbox show there? → A: "None, no checkbox (Recommended)": the dialog opens on None and one submit closes the application, as the flag does today. The checkbox is left out there because that dialog always closes. It shows only in the regular Add event dialog, for Offer and Denied.
- (2026-10-19) Q: ADR-0006 binds the look to the target (blue) oklch identity. How does the green come back? → A: "New ADR-0022 amends colours (Recommended)"
- (2026-10-19) Q: Closing refuses an event dated after today; adding an event does not. What happens to a later date when the box is ticked? → A: "Date stops at today (Recommended)": when the box is ticked, and always in the close dialog, the date cannot be later than today. The command line shows the server's refusal for a later date without `--keep-open`, and nothing changes on the server.

## Supersedes

- PRD 0006 R-011 "The dark theme uses the target oklch colour tokens (ADR 0006) unchanged." The dark theme now uses the original dark palette (R-017 here, ADR-0022).
- PRD 0006 R-012 "The light theme uses the same hues as the dark theme, with a blue primary and light surfaces." The light theme now uses the original light palette, with a teal primary (R-017).
- PRD 0008 R-037 "...in the current visual identity colors (PRD 0006 / ADR 0006 tokens)" now reads "(PRD 0016 / ADR 0022 tokens)". The layout part of R-037 stands.

## Problem

Adding an offer or a rejection to an application's timeline leaves the application open. To close it, the user goes through a second, different dialog behind the flag button and types the outcome again. Two dialogs ask for the same thing in two shapes. The owner wants one dialog for both uses. From Add event, an offer or a rejection closes the application unless the user says otherwise. From the flag, the same dialog closes the application with an offer, a rejection or nothing. The command line should behave the same way. Separately, the owner wants the original green look back in place of the blue that the identity work brought in.

## Users and stories

- US1 (P1) A user clicks the flag on an application and closes it from the event dialog, choosing None, Offer or Denied.
- US2 (P1) A user adds an Offer or Denied event and the application closes with it in the same save.
- US3 (P1) A user adds an Offer or Denied event, unticks the box, and the application stays open.
- US4 (P2) A command-line user adds an offer or denied event that closes the application, or keeps it open with `--keep-open`.
- US5 (P2) Every visitor and user sees Applika in its original teal, in light and in dark.
- US6 (P3) A user of applika-cli 0.1.4 notices no change.

## Requirements

Closing through the event dialog

- R-001 The system has one dialog for adding a timeline event and for closing an application. The separate close dialog no longer exists.
- R-002 Opened from the flag, the dialog offers None, Offer and Denied, opens on None, and does not offer Interview.
- R-003 Opened from Add event, the dialog offers Interview, Offer and Denied, and does not offer None.
- R-004 Closing with None closes the application and adds nothing to the timeline.
- R-005 Closing with Offer or Denied adds that event and closes the application together: both happen or neither does.
- R-006 Opened from the flag, the dialog shows no "close the application" checkbox, always closes, and says that closing is reversible.
- R-007 Opened from Add event with Offer or Denied selected, the dialog shows a "Close the application" checkbox just before the submit button. The box is ticked when the dialog opens.
- R-008 Saving an Offer or Denied event with the box ticked adds the event and closes the application together. With the box unticked, it adds the event and the application stays open.
- R-009 The checkbox does not appear for Interview. Editing an existing event never closes the application.
- R-010 When saving will close the application (the box ticked, or the flag dialog with Offer or Denied), the event date cannot be later than today.
- R-011 Offer and Denied ask for the same details, under the same rules, whichever way the dialog was opened: the date, optional notes, the salary amount, currency and period for an offer, and the reason for a denial.
- R-012 applika-cli `applications timeline add --type offer` or `--type denied` adds the event and closes the application, unless `--keep-open` is given.
- R-013 applika-cli accepts `--keep-open` with `--type interview`, ignores it, and shows no error.
- R-014 applika-cli shows the server's refusal and changes nothing when an offer or denied event that would close the application has a date later than today.
- R-015 Adding an event to a closed application, from the web or the command line, keeps being refused with the message that tells the user to reopen it.
- R-016 applika-cli 0.1.4 keeps working unchanged, including its finalize request, and `applications finalize` with or without `--outcome` keeps working.

The original palette

- R-017 The web uses the palette Applika had before PRD 0006, in light and in dark: every colour that palette defines takes its original value.
- R-018 Colours introduced since then that the original palette has no twin for follow the original hues.
- R-019 Dark stays the default theme. The theme toggle, the fonts (Inter, JetBrains Mono), the sidebar shell and the component style stay as they are.
- R-020 The CV preview keeps its print colours, which match the downloaded PDF. Colours that tell categories apart, such as the seniority badges, stay.

## Permissions and tenancy

A user may close only applications that the user owns, and may add events only to those applications. Closing with an event follows exactly the same ownership rules as closing and as adding an event today. An application that belongs to another user, admins included, returns not found and is never revealed. An application archived in a cycle stays read-only, and closing it is refused as today. The palette applies to every page, for visitors and signed-in users alike. Neither change is behind a beta flag: both reach every user at release.

## Edge cases

- The box is ticked and the server refuses the event (for example an invalid salary). Nothing is written, the application stays open, and the dialog stays open with the error.
- A future date was picked with the box unticked, and then the box is ticked. The date is refused until it is today or earlier, and nothing is sent.
- The application was closed in another tab. Closing with None succeeds and changes nothing; closing with Offer or Denied, or adding an event, is refused with the reopen message.
- The user switches from Offer to Interview and back in the same dialog. The checkbox reappears with the choice the user last made. It is ticked again the next time the dialog opens.
- A closed application is reopened. Its closing offer or denied event stays on the timeline.
- A command-line user passes `--keep-open` with `--type interview`. The interview is added and no warning is printed.
- A command-line user adds an offer to a closed application, with or without `--keep-open`. The command is refused with the reopen hint, as today.
- A user of applika-cli 0.1.4 adds an Offer step. The application stays open, as today.

## Non-goals

- Closing an application when an event is edited, or closing it on every offer or denied event whatever the client asks.
- Any change to the deprecated routes or the finalize request that applika-cli 0.1.4 sends.
- A "none" event type on the timeline.
- The original fonts (DM Sans, Outfit), the original corner radius or the original header layout. Only the colours come back.
- Changing the CV PDF's look or the CV preview's colours.
- A beta flag for either change.

## Success signals

- Closing an application with an offer from the flag takes no more clicks than today. Adding an offer that closes the application takes one dialog instead of two.
- No application closed through an offer or denied event is ever left without that event.
- The owner reviews screenshots of both themes and confirms they look "as was originally".
- The applika-cli 0.1.4 tests stay green.

## Assumptions

- Closing with an event uses the close that already exists (PRD 0008 R-032); nothing new is needed on the server.
- The checkbox reads "Close the application", with the hint "You can reopen it later."
- The checkbox sits on the left of the dialog's bottom row, before Cancel and the submit button, and wraps above them on narrow screens.
- The checkbox keeps the user's choice while the dialog stays open, and is ticked again each time the dialog opens.
- Opened from the flag, the dialog is titled "Close application", its button reads "Close application", and it keeps today's sentence that closing is reversible.
- From the flag, None shows no other fields.
- From Add event, the submit button keeps the label "Add event", ticked or not.
- After adding an event that closes the application, applika-cli prints the closed application with its outcome, as `applications finalize --outcome` does.
- No beta flag: both changes alter existing screens and an existing command, which the beta rule's point 7 leaves ungated.
- The palette covers colours only, including the original shadows and the hero and glow effects. Original colours that nothing on screen uses today are not brought back.
- Dark stays the default theme, as ADR-0006 settled it.
- The CV preview keeps its blue print colour, and the seniority badges keep theirs.
- An Offer step added through applika-cli 0.1.4 does not close the application.
- The command-line change is listed under the next unreleased applika-cli version, as PRD 0015's changes were.
