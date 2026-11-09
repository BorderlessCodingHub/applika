"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  CircleAlert,
  ExternalLink,
  Loader2,
  Pen,
  Plus,
  Search,
  Trash,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { FieldErrors, Path, UseFormReturn } from "react-hook-form";
import { useAdminNumber } from "@/components/admin/admin-format";
import type { CatalogRow } from "@/components/admin/catalog-table";
import {
  CATALOG_VISIBILITY_VALUES,
  type CatalogVisibility,
} from "@/components/admin/catalog-visibility";
import { safeErrorMessage } from "@/components/application-drafts/draft-copy";
import { PhoneField, PhoneInput } from "@/components/phone/phone-field";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePager } from "@/components/phone/phone-pager";
import { PhonePill } from "@/components/phone/phone-pill";
import {
  PhoneSheetDescription,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "@/components/phone/phone-sheet";
import { PhoneSwitch } from "@/components/phone/phone-switch";
import { useIntlLocale } from "@/i18n/intl-locale";
import type { PaginatedResponse } from "@/services/types/admin";

export type CatalogKind = "company" | "platform";

/** The add and edit forms' fields (companies send a URL, platforms may not). */
export interface CatalogFormValues {
  name: string;
  url?: string;
}

/** One form sheet (Add or Edit): the page owns its `useForm`, mutation and open state. */
export interface CatalogFormSheetState<V extends CatalogFormValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Today's `createForm` / `editForm` (zod resolver and schema unchanged). */
  form: UseFormReturn<V>;
  /** Called with the valid values (`form.handleSubmit`). */
  onSubmit: (values: V) => void;
  /** The create / update is in flight: Create / Save read "Creating..." / "Saving...". */
  pending: boolean;
  /** The server's refusal, in its words (`safeErrorMessage`); shown inside the sheet. */
  error?: string | null;
}

export interface CatalogScreenViewProps<
  T extends CatalogRow,
  V extends CatalogFormValues,
> {
  kind: CatalogKind;
  /** `useAdminCompanies` / `useAdminPlatforms` as a section load. */
  rows: PhoneLoad<PaginatedResponse<T>>;
  /** A search, filter or page is loading over the rows on screen. */
  refreshing?: boolean;
  search: string;
  /** Today's search: the page goes back to page 1. */
  onSearchChange: (search: string) => void;
  visibility: CatalogVisibility;
  /** Today's filter: the page goes back to page 1. */
  onVisibilityChange: (visibility: CatalogVisibility) => void;
  /** 1-based. */
  page: number;
  onPageChange: (page: number) => void;
  /** Opens the Add sheet (today's `setCreateOpen(true)`). */
  onAdd: () => void;
  /** Opens the Edit sheet on the row (today's `openEdit`). */
  onEdit: (row: T) => void;
  /** Resolves once the row is gone; rejects to show the server's words in the sheet. */
  onDelete: (row: T) => Promise<void>;
  /** `POST …/publish`: resolve nothing to close, a string (the 409 `detail`) to keep the sheet open on it. */
  onApprove: (row: T) => Promise<string | void>;
  /** Companies only: the status pill and switch (today's `onToggleActive`). */
  onToggleActive?: (row: T) => void;
  /** The company whose status is being saved. */
  togglingId?: string | null;
  add: CatalogFormSheetState<V>;
  edit: CatalogFormSheetState<V>;
}

/** The board's link text: the address without its scheme or a closing slash. */
export function catalogUrlLabel(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** Today's admin table date, "Oct 2, 2026". */
function formatCatalogDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Pending<T> = { row: T; kind: "approve" | "delete" };

/**
 * v3/AdminCompanies and v3/AdminPlatforms below md (under `AdminPhoneHeader`):
 * props in, the board out. The Approve and Delete sheets keep their own
 * pending and error state, as today's `CatalogTable` does.
 */
export function CatalogScreenView<
  T extends CatalogRow,
  V extends CatalogFormValues,
>({
  kind,
  rows,
  refreshing = false,
  search,
  onSearchChange,
  visibility,
  onVisibilityChange,
  page,
  onPageChange,
  onAdd,
  onEdit,
  onDelete,
  onApprove,
  onToggleActive,
  togglingId = null,
  add,
  edit,
}: CatalogScreenViewProps<T, V>) {
  const tKind = useTranslations(`admin.catalog.${kind}`);
  const tVisibility = useTranslations("admin.catalog.visibility");
  const tPhone = useTranslations(`phone.catalog.${kind}`);
  const n = useAdminNumber();
  const searchId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const data = rows.status === "ready" ? rows.data : null;
  const items = data?.items ?? null;
  const filtered = search.trim() !== "" || visibility !== "all";

  const [confirm, setConfirm] = useState<Pending<T> | null>(null);
  const [open, setOpen] = useState(false);
  // The approved row loses its Approve, the deleted row leaves: focus goes to Add.
  const handOff = useRef<Pending<T> | null>(null);

  useEffect(() => {
    const done = handOff.current;
    if (!done || items === null) return;
    const now = items.find((row) => row.id === done.row.id);
    if (now && (done.kind === "delete" || !now.is_public)) return;
    handOff.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    addButton.current?.focus();
  }, [items]);

  const openConfirm = (row: T, action: Pending<T>["kind"]) => {
    setConfirm({ row, kind: action });
    setOpen(true);
  };

  return (
    <div
      data-slot="phone-admin-catalog"
      data-kind={kind}
      className="ph-app ph-ad-body ph-ad-list"
    >
      <div className="ph-cat-search">
        <label htmlFor={searchId} className="ph-sr">
          {tKind("searchLabel")}
        </label>
        <Search size={18} aria-hidden="true" className="ph-cat-search-ic" />
        <input
          id={searchId}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={tKind("searchPlaceholder")}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="ph-input ph-cat-search-input"
        />
      </div>

      <div
        role="group"
        aria-label={tVisibility("label")}
        data-slot="visibility-filter"
        className="ph-seg ph-cat-seg"
      >
        {CATALOG_VISIBILITY_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={visibility === value}
            data-visibility={value}
            className={visibility === value ? "ph-on" : undefined}
            onClick={() => onVisibilityChange(value)}
          >
            <span className="max-w-full truncate">{tVisibility(value)}</span>
          </button>
        ))}
      </div>

      <div className="ph-cat-bar">
        <span data-slot="catalog-count" className="ph-mono ph-cat-count">
          {data
            ? tKind("count", { count: data.total, total: n(data.total) })
            : null}
        </span>
        <button
          ref={addButton}
          type="button"
          aria-haspopup="dialog"
          data-action="add-catalog"
          className="ph-btn ph-pri ph-sm"
          onClick={onAdd}
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          {tKind("add")}
        </button>
      </div>

      <PhoneLoadable
        state={rows}
        loading={
          <PhoneSkeleton label={tPhone("loading")}>
            <PhoneSkeletonCard className="h-[168px]" />
            <PhoneSkeletonCard className="h-[168px]" />
            <PhoneSkeletonCard className="h-[168px]" />
          </PhoneSkeleton>
        }
      >
        {(list) =>
          list.items.length === 0 ? (
            <p
              data-slot="catalog-empty"
              data-reason={filtered ? "no-match" : "empty"}
              className="ph-card ph-hint"
            >
              {filtered ? tKind("noMatch") : tKind("empty")}
            </p>
          ) : (
            <ul
              data-slot="catalog-list"
              data-refreshing={refreshing || undefined}
              aria-busy={refreshing || undefined}
              className="ph-cat-list"
            >
              {list.items.map((row) => (
                <CatalogCard
                  key={row.id}
                  kind={kind}
                  row={row}
                  toggling={togglingId === row.id}
                  onToggleActive={
                    onToggleActive ? () => onToggleActive(row) : undefined
                  }
                  onApprove={() => openConfirm(row, "approve")}
                  onEdit={() => onEdit(row)}
                  onDelete={() => openConfirm(row, "delete")}
                />
              ))}
            </ul>
          )
        }
      </PhoneLoadable>

      {data ? (
        <PhonePager
          page={page}
          totalPages={data.total_pages}
          onPageChange={onPageChange}
          label={tKind("pages")}
        />
      ) : null}

      <CatalogFormSheet kind={kind} mode="add" state={add} />
      <CatalogFormSheet kind={kind} mode="edit" state={edit} />

      <CatalogConfirmSheet
        kind={kind}
        confirm={confirm}
        open={open}
        onOpenChange={setOpen}
        fallbackFocus={addButton}
        onApprove={onApprove}
        onDelete={onDelete}
        onDone={(done) => {
          handOff.current = done;
        }}
      />
    </div>
  );
}

function CatalogCard<T extends CatalogRow>({
  kind,
  row,
  toggling,
  onToggleActive,
  onApprove,
  onEdit,
  onDelete,
}: {
  kind: CatalogKind;
  row: T;
  toggling: boolean;
  onToggleActive?: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tTable = useTranslations("admin.catalog.table");
  const tApprove = useTranslations("admin.catalog.approve");
  const tVisibility = useTranslations("admin.catalog.visibility");
  const tCatalog = useTranslations("phone.catalog");
  const tAdmin = useTranslations("phone.admin");
  const n = useAdminNumber();
  const locale = useIntlLocale();
  const reasonId = useId();
  const used = row.applications_count > 0;
  const creator = row.created_by?.username;

  return (
    <li
      data-slot="catalog-row"
      data-catalog-id={row.id}
      data-kind={kind}
      data-private={!row.is_public || undefined}
      data-used={used || undefined}
      className="ph-card ph-cat-row"
    >
      <div className="ph-cat-head">
        <div className="ph-cat-title">
          <span className="ph-cat-name">{row.name}</span>
          {!row.is_public ? (
            <PhonePill tone="warn">{tTable("private")}</PhonePill>
          ) : null}
        </div>
        {onToggleActive ? (
          <>
            <PhonePill tone={row.is_active ? "ok" : undefined}>
              {row.is_active ? tTable("active") : tTable("inactive")}
            </PhonePill>
            {/* aria-disabled, never disabled: a disabled switch drops focus to <body>. */}
            <PhoneSwitch
              checked={row.is_active === true}
              aria-label={tTable("toggleStatusFor", { name: row.name })}
              aria-disabled={toggling || undefined}
              aria-busy={toggling || undefined}
              data-action="toggle-active"
              onCheckedChange={() => {
                if (!toggling) onToggleActive();
              }}
            />
          </>
        ) : null}
      </div>

      {row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          data-slot="catalog-url"
          className="ph-hit ph-cat-url"
        >
          <span className="ph-mono ph-cat-url-in">
            <span className="ph-cat-url-text">{catalogUrlLabel(row.url)}</span>
            <ExternalLink
              size={12}
              aria-hidden="true"
              className="ph-cat-url-ic"
            />
            <span className="ph-sr">{tTable("opensNewTab")}</span>
          </span>
        </a>
      ) : (
        <span data-slot="catalog-url" className="ph-mono ph-cat-nourl">
          <span aria-hidden="true">—</span>
          <span className="ph-sr">{tTable("noUrl")}</span>
        </span>
      )}

      <p data-slot="catalog-meta" className="ph-hint ph-cat-meta">
        {tCatalog.rich("meta", {
          addedBy: creator ?? "—",
          apps: n(row.applications_count),
          count: row.applications_count,
          date: formatCatalogDate(row.created_at, locale),
          who: (chunks) =>
            creator ? (
              chunks
            ) : (
              <>
                <span aria-hidden="true">{chunks}</span>
                <span className="ph-sr">{tVisibility("notRecorded")}</span>
              </>
            ),
          mono: (chunks) => <span className="ph-mono">{chunks}</span>,
        })}
      </p>

      <div className="ph-cat-actions">
        {!row.is_public ? (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={tApprove("rowLabel", { name: row.name })}
            data-slot="approve-catalog-row"
            data-action="approve-catalog"
            className="ph-btn ph-pri ph-sm"
            onClick={onApprove}
          >
            {tApprove("action")}
          </button>
        ) : null}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={tTable("edit", { name: row.name })}
          data-action="edit-catalog"
          className="ph-btn ph-sec ph-sm ph-cat-edit"
          onClick={onEdit}
        >
          <Pen size={16} aria-hidden="true" />
          {tAdmin("edit")}
        </button>
        {/* A used row's Delete is announced unavailable and stays focusable, so its reason is read (PRD 0022). */}
        <button
          type="button"
          aria-haspopup={used ? undefined : "dialog"}
          aria-label={tTable("delete", { name: row.name })}
          aria-disabled={used || undefined}
          aria-describedby={used ? reasonId : undefined}
          data-action="delete-catalog"
          className="ph-btn ph-dan ph-sm"
          onClick={() => {
            if (!used) onDelete();
          }}
        >
          <Trash size={16} aria-hidden="true" />
          {tTable("deleteAction")}
        </button>
      </div>
      {used ? (
        <p id={reasonId} data-slot="catalog-delete-reason" className="ph-hint">
          {tTable("cannotDelete")}
        </p>
      ) : null}
    </li>
  );
}

/** The fields' messages: the generic form's errors read as the shared shape. */
function fieldError<V extends CatalogFormValues>(
  form: UseFormReturn<V>,
  name: keyof CatalogFormValues,
): string | undefined {
  const errors = form.formState.errors as FieldErrors<CatalogFormValues>;
  return errors[name]?.message;
}

function CatalogFormSheet<V extends CatalogFormValues>({
  kind,
  mode,
  state,
}: {
  kind: CatalogKind;
  mode: "add" | "edit";
  state: CatalogFormSheetState<V>;
}) {
  const tKind = useTranslations(`admin.catalog.${kind}`);
  const tForm = useTranslations("admin.catalog.form");
  const { open, onOpenChange, form, onSubmit, pending, error } = state;
  const company = kind === "company";
  const submit = pending
    ? tForm(mode === "add" ? "creating" : "saving")
    : tForm(mode === "add" ? "create" : "save");

  return (
    <PhoneSheetFrame
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <span className="ph-grab" aria-hidden="true" />
      <PhoneSheetTitle className="ph-h2 ph-cat-sheet-h">
        {mode === "add" ? tKind("add") : tKind("editTitle")}
      </PhoneSheetTitle>
      <form
        noValidate
        data-slot="catalog-form"
        data-mode={mode}
        className="ph-cat-form"
        onSubmit={(event) => {
          if (pending) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <PhoneField label={tForm("name")} error={fieldError(form, "name")}>
          <PhoneInput
            required
            autoComplete="off"
            maxLength={company ? undefined : 100}
            {...form.register("name" as Path<V>)}
          />
        </PhoneField>
        <PhoneField
          label={company ? tForm("url") : tForm("urlOptional")}
          error={fieldError(form, "url")}
        >
          <PhoneInput
            type={company ? "url" : undefined}
            required={company}
            autoComplete="off"
            maxLength={company ? undefined : 200}
            placeholder={!company || mode === "add" ? "https://..." : undefined}
            {...form.register("url" as Path<V>)}
          />
        </PhoneField>
        {error ? (
          <div
            role="alert"
            data-slot="catalog-form-error"
            data-tone="error"
            className="ph-notice"
          >
            <CircleAlert
              size={16}
              aria-hidden="true"
              className="ph-notice-ic"
            />
            <p>{error}</p>
          </div>
        ) : null}
        <div className="ph-cat-sheet-actions">
          {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
          <button
            type="button"
            aria-disabled={pending || undefined}
            data-disabled={pending || undefined}
            className="ph-btn ph-sec"
            onClick={() => {
              if (!pending) onOpenChange(false);
            }}
          >
            {tForm("cancel")}
          </button>
          <button
            type="submit"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            data-disabled={pending || undefined}
            data-action="save-catalog"
            className="ph-btn ph-pri"
          >
            {pending ? (
              <Loader2 size={16} aria-hidden="true" className="ph-spin" />
            ) : null}
            {submit}
          </button>
        </div>
      </form>
    </PhoneSheetFrame>
  );
}

/**
 * Approve or Delete, on one sheet: today's `ApproveCatalogButton` and
 * `CatalogTable` delete dialog as the board draws them. Pending keeps the
 * sheet; a refusal shows the server's words in it.
 */
function CatalogConfirmSheet<T extends CatalogRow>({
  kind,
  confirm,
  open,
  onOpenChange,
  fallbackFocus,
  onApprove,
  onDelete,
  onDone,
}: {
  kind: CatalogKind;
  confirm: Pending<T> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackFocus: RefObject<HTMLElement | null>;
  onApprove: (row: T) => Promise<string | void>;
  onDelete: (row: T) => Promise<void>;
  onDone: (done: Pending<T>) => void;
}) {
  const tKind = useTranslations(`admin.catalog.${kind}`);
  const tTable = useTranslations("admin.catalog.table");
  const tApprove = useTranslations("admin.catalog.approve");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each open (a new row, or the same one again) starts without the last refusal.
  const [shownFor, setShownFor] = useState(confirm);
  if (confirm !== shownFor) {
    setShownFor(confirm);
    setError(null);
  }
  const row = confirm?.row ?? null;
  const approving = confirm?.kind === "approve";
  const creator = row?.created_by?.username;

  const run = async () => {
    if (!confirm || pending) return;
    setPending(true);
    setError(null);
    let message: string | void = undefined;
    try {
      if (confirm.kind === "approve") {
        message = await onApprove(confirm.row);
      } else {
        await onDelete(confirm.row);
      }
    } catch (caught) {
      message =
        confirm.kind === "approve"
          ? tApprove("failed")
          : safeErrorMessage(caught, tKind("deleteFailed"));
    }
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    onDone(confirm);
    onOpenChange(false);
  };

  return (
    <PhoneSheetFrame
      open={open}
      alert
      described
      fallbackFocus={fallbackFocus}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <span className="ph-grab" aria-hidden="true" />
      <PhoneSheetTitle className="ph-h2 ph-cat-sheet-h">
        {row
          ? approving
            ? tApprove("title", { name: row.name })
            : tTable("delete", { name: row.name })
          : null}
      </PhoneSheetTitle>
      <div
        data-slot={approving ? "approve-catalog-sheet" : "delete-catalog-sheet"}
        className="ph-cat-confirm"
      >
        {approving && row?.url ? (
          <p className="ph-mono ph-cat-approve-url">{row.url}</p>
        ) : null}
        {approving ? (
          <PhoneSheetDescription asChild>
            <div className="ph-cat-text">
              <p>
                {row
                  ? tApprove(`becomesPublic.${kind}`, { name: row.name })
                  : null}
              </p>
              {creator ? (
                <p className="ph-cat-muted">
                  {tApprove("keepsAddedBy", { addedBy: creator })}
                </p>
              ) : null}
              <p className="ph-cat-muted">{tApprove("permanent")}</p>
            </div>
          </PhoneSheetDescription>
        ) : (
          <PhoneSheetDescription className="ph-hint ph-cat-undone">
            {tTable("deleteDescription")}
          </PhoneSheetDescription>
        )}
        {error ? (
          <div
            role="alert"
            data-slot={
              approving ? "approve-catalog-error" : "catalog-delete-error"
            }
            data-tone="error"
            className="ph-notice"
          >
            <CircleAlert
              size={16}
              aria-hidden="true"
              className="ph-notice-ic"
            />
            <p>{error}</p>
          </div>
        ) : null}
        <div className="ph-cat-sheet-actions">
          {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
          <button
            type="button"
            aria-disabled={pending || undefined}
            data-disabled={pending || undefined}
            className="ph-btn ph-sec"
            onClick={() => {
              if (!pending) onOpenChange(false);
            }}
          >
            {approving ? tApprove("cancel") : tTable("cancel")}
          </button>
          <button
            type="button"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            data-disabled={pending || undefined}
            data-action={
              approving ? "confirm-approve-catalog" : "confirm-delete-catalog"
            }
            className={approving ? "ph-btn ph-pri" : "ph-btn ph-dan"}
            onClick={() => void run()}
          >
            {pending ? (
              <Loader2 size={16} aria-hidden="true" className="ph-spin" />
            ) : null}
            {approving
              ? tApprove("action")
              : pending
                ? tTable("deleting")
                : tTable("deleteAction")}
          </button>
        </div>
      </div>
    </PhoneSheetFrame>
  );
}
