# applika-cli — CV commands (spec for owner validation)


Owner: "I want it in a new ticket, but for now only create the ticket showing the command and it's
every parameter to: list all master cvs, create, edit, delete and get a master cv. Download in pdf
or markdown (to download create a param called —dir to change where cv is created on download and
—filename to change the name, to choose between pdf and markdown create a required param
—type=pdf or —type=md, when using the cli to create or edit a cv and an application as well,
accept a command called —Jose where receive the full payload json instead the the full named
parameter. Create a cli command to given an application id I can copy a master cv and do the
editing in a single command, a command to edit this cv copy, download the diff, download the cv
copy, remove this cv copy from this application. Define in the ticket all commands with all
parameters to my validation"

Status: **DRAFT (revision 3) — open points answered; awaiting the owner's go. Nothing is built.** `—Jose` was read as `--json`; revision 2 replaces it with `--file` for CVs.

## Owner revision (2026-09-19)

"When creating and editing a master cv and a copied cv, instead of —json change it to —file that
accepts json or yaml/yml the only other parameter accepted is —name to name the master cv and to
copied cv, but to copied cv keep the —from when creating"

So CV create/edit take **only** `--file` and `--name` (plus `--from` on copy create). The per-field
options of the first draft (`--headline`, `--link`, `--skill`, `--clear`, …) are dropped.

## Conventions (all commands)

| Convention | Rule |
|---|---|
| Ids | Snowflake ids as strings, as the API returns them. |
| `--file <path>` | A CV document in **JSON** (`.json`) or **YAML** (`.yaml` / `.yml`); the format is picked by the extension, and `-` reads JSON or YAML from stdin. Its keys are the API field names: `name`, `full_name`, `headline`, `location`, `email`, `phone`, `summary`, `links`, `skills`, `experience`, `projects`, `education`, `certifications`, `languages`. Validated locally against the API's schema (types, required fields, lengths, `YYYY-MM` dates) before anything is sent; unknown keys are an error. |
| `--name <text>` | The CV label (1–200). With `--file`, it overrides the file's `name`. |
| Edit semantics | Both edits are **partial**: the CLI reads the current CV, applies the keys present in the file (a section present in the file replaces that whole section; an absent key is left unchanged) and `--name`, then sends it — `PATCH` for a master CV, the whole document via `PUT` for a copy. Same behaviour for both, whichever HTTP verb the API uses. |
| Item ids | List items need a client `id` (the web diff matches items by it). Missing ids in the file are generated; ids present are kept. |
| Round trip | `get --output json` / `--output yaml` prints a document `--file` accepts, so export → edit → `edit --file` works. |
| Output | Human summary by default; `--output json` or `--output yaml` prints the API response. `--output md` prints Markdown: on `get`, `create` and `edit` it is the CV itself as the server renders it (the same Markdown as `download --type md`, from `GET /base-cvs/{id}/markdown` or `GET /applications/{id}/cv/markdown`); on `cvs list` it is a Markdown table (id, name, headline, updated). `md` is output only — `--file` does not read Markdown. Owner, 2026-09-19: "Accept markdown in —output as well". |
| Errors | The API's `detail` is printed; exit 1 on an API error, exit 2 on a usage or file-validation error. |
| Downloads | `--type pdf\|md` is **required**. `--dir` defaults to the current directory (created if missing). `--filename` defaults to the server's file name (`Content-Disposition`); the extension matching `--type` is added when missing. An existing file is not overwritten unless `--force`. |

## Master CVs — `applika cvs …`

| Command | Arguments / options | API |
|---|---|---|
| `applika cvs list` | `--output table\|json\|yaml\|md` | `GET /base-cvs` |
| `applika cvs get <cv-id>` | `--output text\|json\|yaml\|md` | `GET /base-cvs/{id}` |
| `applika cvs create` | `--file <path>` **required** · `--name <text>` (required unless the file has `name`) · `--output text\|json\|yaml\|md` | `POST /base-cvs` (max 3 per user; the 409 is shown). The file must hold every field the API requires: `full_name`, `headline`, `location`, `email`. |
| `applika cvs edit <cv-id>` | `--file <path>` and/or `--name <text>` (at least one) · `--output text\|json\|yaml\|md` | `PATCH /base-cvs/{id}` with the keys given |
| `applika cvs delete <cv-id>` | `--yes` (skip the confirmation) | `DELETE /base-cvs/{id}` (copies keep their content; their `base_cv_id` becomes null) |
| `applika cvs download <cv-id>` | `--type pdf\|md` **required** · `--dir <path>` · `--filename <name>` · `--force` | `POST /base-cvs/{id}/pdf` or `GET /base-cvs/{id}/markdown` |

## An application's CV copy — `applika applications cv …`

| Command | Arguments / options | API |
|---|---|---|
| `applika applications cv get <application-id>` | `--output text\|json\|yaml\|md` | `GET /applications/{id}/cv` |
| `applika applications cv create <application-id>` | `--from <cv-id>` **required** · `--file <path>` (optional: edits applied to the fresh copy in the same command) · `--name <text>` (optional) · `--output text\|json\|yaml\|md` | `POST /applications/{id}/cv` `{base_cv_id}`; then, only when `--file` or `--name` is given, `PUT /applications/{id}/cv` with the copy updated as in "Edit semantics" |
| `applika applications cv edit <application-id>` | `--file <path>` and/or `--name <text>` (at least one) · `--output text\|json\|yaml\|md` | `GET` then `PUT /applications/{id}/cv` (whole document, updated as in "Edit semantics") |
| `applika applications cv delete <application-id>` | `--yes` | `DELETE /applications/{id}/cv` |
| `applika applications cv download <application-id>` | `--type pdf\|md` **required** · `--dir <path>` · `--filename <name>` · `--force` | `POST /applications/{id}/cv/pdf` or `GET /applications/{id}/cv/markdown` |
| `applika applications cv diff <application-id>` | `--type pdf\|md` **required** · `--dir <path>` · `--filename <name>` · `--force` · `--print` (with `--type md`: print to stdout instead of a file) | `GET /applications/{id}/cv/diff/pdf` or `/diff/markdown` (409 when the copy has no baseline — shown as "nothing to compare against") |

Closed or archived applications: the API refuses writes (409 / 422); the CLI prints the `detail`.
Reads and downloads always work.

## Applications — `--file` and job description on create and edit

Owner, 2026-09-19: "If upgrade a major version in cli, —file and add job description".

| Command | New options |
|---|---|
| `applika applications new` | `--file <path.json\|.yaml\|.yml\|->` — the full create payload (API field names) instead of the named options; mutually exclusive with them. · `--job-description <text>` or `--job-description-file <path>` (plain text / Markdown) — sets the application's `job_description`; also accepted as the `job_description` key in `--file`. |
| `applika applications edit <application-id>` | `--file <path>` — the keys present are updated, the rest left unchanged (same edit semantics as CVs); mutually exclusive with the named options. · `--job-description <text>` / `--job-description-file <path>`; `--job-description ""` clears it. |

The existing named options of `applications new/edit` stay, so every 0.1.4 / 0.2.0 invocation keeps working.

## Version

Owner: "upgrade a major version". These commands ship as **applika-cli 1.0.0**, the next major after the unpublished 0.2.0. `cli/CHANGELOG.md` gets a `## [1.0.0]` section; `pyproject.toml` goes to 1.0.0. Existing commands and flags are not removed, so 0.x scripts keep working.

## Status

The three open points of revision 2 are answered (version 1.0.0; `--file` for applications; job description added). The spec waits for the owner's go to build.
