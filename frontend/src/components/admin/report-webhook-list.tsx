"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  BadgeAlert,
  CircleAlert,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
} from "lucide-react";
import { useLocale } from "next-intl";

import {
  MEMBERSHIP_BADGE_LABEL,
  MembershipBadge,
  type MembershipBadgeKey,
} from "@/components/badges/membership-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { liveCopy, word } from "@/i18n/translator";
import { cn } from "@/lib/utils";

export interface ReportWebhookRow {
  id: string;
  label: string | null;
  /** `[]` only on a row carried over from before badges: it receives nothing. */
  badges: MembershipBadgeKey[];
  webhook_url_masked: string;
}

export type ReportWebhookListState = "loading" | "error" | "empty" | "ready";

/**
 * The list's words, in the active language (`admin.webhooks.list.*`). The
 * components rendering them call `useLocale`, so a switch re-renders them.
 * Never spread it.
 */
export const REPORT_WEBHOOK_LIST_COPY = liveCopy("admin.webhooks.list", [
  "title",
  "add",
  "unlabelled",
  "noBadge",
  "badgeTerm",
  "webhookTerm",
  "loading",
  "errorTitle",
  "errorBody",
  "retry",
  "emptyTitle",
  "emptyBody",
  "deleteTitle",
  "deleteConfirm",
]);

function rowLabel(row: Pick<ReportWebhookRow, "label">): string | null {
  return row.label?.trim() ? row.label : null;
}

/** The row's name inside "Edit …" / "Delete …" accessible names. */
export function reportWebhookTargetName(
  row: Pick<ReportWebhookRow, "label" | "webhook_url_masked">,
): string {
  const label = rowLabel(row);
  if (label) return label;
  const id = /\/webhooks\/(\d+)\//.exec(row.webhook_url_masked)?.[1];
  return id
    ? word("admin.webhooks.list.targetId", { id })
    : word("admin.webhooks.list.targetUnlabelled");
}

/** `data-badges` hook: the held keys, space-separated, or `none`. */
export function reportWebhookBadgesAttr(
  row: Pick<ReportWebhookRow, "badges">,
): string {
  return row.badges.length > 0 ? row.badges.join(" ") : "none";
}

export function reportWebhookDeleteDescription(
  row: Pick<ReportWebhookRow, "label" | "badges">,
): string {
  const label = rowLabel(row);
  if (row.badges.length === 0) {
    return label
      ? word("admin.webhooks.list.deleteNoBadge", { target: label })
      : word("admin.webhooks.list.deleteNoBadgeUnlabelled");
  }
  const names = row.badges.map((badge) => MEMBERSHIP_BADGE_LABEL[badge]);
  const members =
    names.length === 2
      ? word("admin.webhooks.list.badgePair", {
          first: names[0],
          second: names[1],
        })
      : names.join(", ");
  return word("admin.webhooks.list.deleteBody", {
    members,
    target: label ?? word("admin.webhooks.list.thisWebhook"),
  });
}

export function reportWebhookListState({
  webhooks,
  isLoading,
  isError,
}: {
  webhooks: ReportWebhookRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
}): ReportWebhookListState {
  if (isLoading) return "loading";
  if (webhooks) return webhooks.length > 0 ? "ready" : "empty";
  return isError ? "error" : "loading";
}

export interface ReportWebhookListProps {
  webhooks: ReportWebhookRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onAdd: () => void;
  onEdit: (webhook: ReportWebhookRow) => void;
  onDelete: (webhook: ReportWebhookRow) => void;
  deletingId?: string | null;
  className?: string;
}

export function ReportWebhookList({
  webhooks,
  isLoading = false,
  isError = false,
  onRetry,
  onAdd,
  onEdit,
  onDelete,
  deletingId = null,
  className,
}: ReportWebhookListProps) {
  const headingId = useId();
  // Subscribes: the copy getters read the active language at render.
  useLocale();
  const addRef = useRef<HTMLButtonElement>(null);
  const handOffId = useRef<string | null>(null);
  const state = reportWebhookListState({ webhooks, isLoading, isError });

  // A deleted row takes its focused trigger with it; land on Add webhook, never on a refetch.
  useEffect(() => {
    const id = handOffId.current;
    if (!id || !webhooks || webhooks.some((w) => w.id === id)) return;
    handOffId.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    addRef.current?.focus();
  }, [webhooks]);

  const confirmDelete = (row: ReportWebhookRow) => {
    handOffId.current = row.id;
    onDelete(row);
  };

  return (
    <section
      aria-labelledby={headingId}
      data-slot="report-webhooks"
      data-state={state}
      className={cn(
        "@container overflow-hidden rounded-xl bg-card shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Webhook aria-hidden className="size-4 text-muted-foreground" />
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            {REPORT_WEBHOOK_LIST_COPY.title}
          </h2>
          {state === "ready" && webhooks ? (
            <Badge aria-hidden variant="secondary" className="font-numeric">
              {webhooks.length}
            </Badge>
          ) : null}
        </div>
        <Button ref={addRef} type="button" size="sm" onClick={onAdd}>
          <Plus aria-hidden data-icon="inline-start" />
          {REPORT_WEBHOOK_LIST_COPY.add}
        </Button>
      </div>

      {state === "loading" ? (
        <div role="status" className="divide-y divide-border">
          <span className="sr-only">{REPORT_WEBHOOK_LIST_COPY.loading}</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : state === "error" ? (
        <div role="alert" className="p-4">
          <EmptyState
            icon={CircleAlert}
            title={REPORT_WEBHOOK_LIST_COPY.errorTitle}
            description={REPORT_WEBHOOK_LIST_COPY.errorBody}
            action={
              onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                >
                  <RefreshCw aria-hidden data-icon="inline-start" />
                  {REPORT_WEBHOOK_LIST_COPY.retry}
                </Button>
              ) : null
            }
          />
        </div>
      ) : state === "empty" ? (
        <div className="p-4">
          <EmptyState
            icon={Webhook}
            title={REPORT_WEBHOOK_LIST_COPY.emptyTitle}
            description={REPORT_WEBHOOK_LIST_COPY.emptyBody}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {webhooks?.map((row) => (
            <ReportWebhookItem
              key={row.id}
              row={row}
              deleting={deletingId === row.id}
              onEdit={onEdit}
              onDelete={confirmDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportWebhookItem({
  row,
  deleting,
  onEdit,
  onDelete,
}: {
  row: ReportWebhookRow;
  deleting: boolean;
  onEdit: (webhook: ReportWebhookRow) => void;
  onDelete: (webhook: ReportWebhookRow) => void;
}) {
  useLocale();
  const label = rowLabel(row);
  const target = reportWebhookTargetName(row);

  return (
    <li
      data-slot="report-webhook-row"
      data-webhook-id={row.id}
      data-badges={reportWebhookBadgesAttr(row)}
      aria-busy={deleting || undefined}
      className={cn(
        "flex items-start gap-3 px-5 py-4 transition-opacity",
        deleting && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
      >
        <Webhook className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3
            className={cn(
              "min-w-0 pt-1.5 text-sm leading-5 break-words",
              label
                ? "font-semibold text-foreground"
                : "font-medium text-foreground/70 italic",
            )}
          >
            {label ?? REPORT_WEBHOOK_LIST_COPY.unlabelled}
          </h3>
          <div className="-mr-2 flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={word("admin.webhooks.list.edit", { target })}
              disabled={deleting}
              onClick={() => onEdit(row)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil aria-hidden />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={word("admin.webhooks.list.delete", { target })}
                  disabled={deleting}
                  aria-busy={deleting || undefined}
                  className="text-destructive hover:text-destructive"
                >
                  {deleting ? (
                    <Loader2 aria-hidden className="animate-spin" />
                  ) : (
                    <Trash2 aria-hidden />
                  )}
                </Button>
              }
              title={REPORT_WEBHOOK_LIST_COPY.deleteTitle}
              description={reportWebhookDeleteDescription(row)}
              confirmLabel={REPORT_WEBHOOK_LIST_COPY.deleteConfirm}
              onConfirm={() => onDelete(row)}
            />
          </div>
        </div>

        <dl className="grid gap-2 text-sm @2xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @2xl:gap-6">
          <WebhookDetail term={REPORT_WEBHOOK_LIST_COPY.badgeTerm}>
            <span
              data-slot="report-webhook-badges"
              className={cn(
                "inline-flex items-start gap-1.5 text-foreground",
                // Chips may wrap; the no-badge line keeps its icon beside the words.
                row.badges.length > 0 && "flex-wrap",
              )}
            >
              {row.badges.length > 0 ? (
                row.badges.map((badge) => (
                  <MembershipBadge
                    key={badge}
                    badge={badge}
                    purpose="label"
                    data-slot="report-webhook-badge"
                  />
                ))
              ) : (
                <>
                  <BadgeAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  {REPORT_WEBHOOK_LIST_COPY.noBadge}
                </>
              )}
            </span>
          </WebhookDetail>
          <WebhookDetail term={REPORT_WEBHOOK_LIST_COPY.webhookTerm}>
            <code
              data-slot="report-webhook-url"
              className="font-mono text-xs break-all text-foreground/80"
            >
              {row.webhook_url_masked}
            </code>
          </WebhookDetail>
        </dl>
      </div>
    </li>
  );
}

function WebhookDetail({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] content-start items-baseline gap-x-3 @2xl:grid-cols-1 @2xl:gap-y-1.5">
      <dt className="font-display text-[11px] font-semibold tracking-wide-label text-foreground/70 uppercase">
        {term}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <Skeleton className="size-8 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1.5">
        <Skeleton className="h-4 w-40 max-w-full" />
        <div className="grid gap-2 @2xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @2xl:gap-6">
          <Skeleton className="h-4 w-28 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
    </div>
  );
}
