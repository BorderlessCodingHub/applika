"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  CircleAlert,
  Hash,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
} from "lucide-react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DiscordWebhookRow {
  id: string;
  label: string | null;
  guild_id: string;
  role_ids: string[];
  webhook_url_masked: string;
}

export type DiscordWebhookListState = "loading" | "error" | "empty" | "ready";

export const UNLABELLED_WEBHOOK = "Unlabelled webhook";

function rowLabel(row: Pick<DiscordWebhookRow, "label">): string | null {
  return row.label?.trim() ? row.label : null;
}

/** The row's name inside "Edit …" / "Delete …" accessible names. */
export function discordWebhookTargetName(
  row: Pick<DiscordWebhookRow, "label" | "guild_id">,
): string {
  return rowLabel(row) ?? `webhook for server ${row.guild_id}`;
}

export function discordWebhookListState({
  webhooks,
  isLoading,
  isError,
}: {
  webhooks: DiscordWebhookRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
}): DiscordWebhookListState {
  if (isLoading) return "loading";
  if (webhooks) return webhooks.length > 0 ? "ready" : "empty";
  return isError ? "error" : "loading";
}

export interface DiscordWebhookListProps {
  webhooks: DiscordWebhookRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onAdd: () => void;
  onEdit: (webhook: DiscordWebhookRow) => void;
  onDelete: (webhook: DiscordWebhookRow) => void;
  deletingId?: string | null;
  className?: string;
}

export function DiscordWebhookList({
  webhooks,
  isLoading = false,
  isError = false,
  onRetry,
  onAdd,
  onEdit,
  onDelete,
  deletingId = null,
  className,
}: DiscordWebhookListProps) {
  const headingId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const handOffId = useRef<string | null>(null);
  const state = discordWebhookListState({ webhooks, isLoading, isError });

  // A deleted row takes its focused trigger with it; land on Add webhook, never on a refetch.
  useEffect(() => {
    const id = handOffId.current;
    if (!id || !webhooks || webhooks.some((w) => w.id === id)) return;
    handOffId.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    addRef.current?.focus();
  }, [webhooks]);

  const confirmDelete = (row: DiscordWebhookRow) => {
    handOffId.current = row.id;
    onDelete(row);
  };

  return (
    <section
      aria-labelledby={headingId}
      data-slot="discord-webhooks"
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
            Report webhooks
          </h2>
          {state === "ready" && webhooks ? (
            <Badge aria-hidden variant="secondary" className="font-numeric">
              {webhooks.length}
            </Badge>
          ) : null}
        </div>
        <Button ref={addRef} type="button" size="sm" onClick={onAdd}>
          <Plus aria-hidden data-icon="inline-start" />
          Add webhook
        </Button>
      </div>

      {state === "loading" ? (
        <div role="status" className="divide-y divide-border">
          <span className="sr-only">Loading webhooks</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : state === "error" ? (
        <div role="alert" className="p-4">
          <EmptyState
            icon={CircleAlert}
            title="Could not load webhooks"
            description="The list did not load. Check your connection and try again."
            action={
              onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                >
                  <RefreshCw aria-hidden data-icon="inline-start" />
                  Try again
                </Button>
              ) : null
            }
          />
        </div>
      ) : state === "empty" ? (
        <div className="p-4">
          <EmptyState
            icon={Hash}
            title="No webhooks yet"
            description="Reports are saved but not posted to Discord until you add a webhook."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {webhooks?.map((row) => (
            <DiscordWebhookItem
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

function DiscordWebhookItem({
  row,
  deleting,
  onEdit,
  onDelete,
}: {
  row: DiscordWebhookRow;
  deleting: boolean;
  onEdit: (webhook: DiscordWebhookRow) => void;
  onDelete: (webhook: DiscordWebhookRow) => void;
}) {
  const label = rowLabel(row);
  const target = discordWebhookTargetName(row);

  return (
    <li
      data-slot="discord-webhook-row"
      data-webhook-id={row.id}
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
        <Hash className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3
            className={cn(
              "min-w-0 pt-1.5 text-sm leading-5 break-words",
              label
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground italic",
            )}
          >
            {label ?? UNLABELLED_WEBHOOK}
          </h3>
          <div className="-mr-2 flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${target}`}
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
                  aria-label={`Delete ${target}`}
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
              title="Delete webhook?"
              description={`Reports will no longer be posted to ${label ?? "this webhook"} in server ${row.guild_id}. This cannot be undone.`}
              confirmLabel="Delete"
              onConfirm={() => onDelete(row)}
            />
          </div>
        </div>

        <dl className="grid gap-2 text-sm @2xl:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1.4fr)] @2xl:gap-6">
          <WebhookDetail term="Server">
            <span
              data-slot="discord-webhook-guild"
              className="font-numeric text-foreground"
            >
              {row.guild_id}
            </span>
          </WebhookDetail>
          <WebhookDetail term="Roles">
            {row.role_ids.length > 0 ? (
              <ul
                data-slot="discord-webhook-roles"
                className="flex flex-wrap gap-1.5"
              >
                {row.role_ids.map((roleId) => (
                  <li key={roleId}>
                    <Badge variant="outline" className="font-numeric">
                      {roleId}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">Any member</span>
            )}
          </WebhookDetail>
          <WebhookDetail term="Webhook">
            <code
              data-slot="discord-webhook-url"
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
      <dt className="font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
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
        <div className="grid gap-2 @2xl:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1.4fr)] @2xl:gap-6">
          <Skeleton className="h-4 w-36 max-w-full" />
          <Skeleton className="h-4 w-28 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
    </div>
  );
}
