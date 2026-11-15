"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleAlert, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { McpCopyButton } from "@/components/mcp/mcp-copy-button";
import {
  MCP_DESK_BTN,
  MCP_DESK_BTN_PRI,
  McpCreateForm,
  McpNewTokenIcon,
} from "@/components/mcp/mcp-create-form";
import { activeMcpSessions, useMcpDates } from "@/components/mcp/mcp-format";
import { McpIcon } from "@/components/mcp/mcp-icon";
import { McpScopeChip } from "@/components/mcp/mcp-scope-chip";
import { McpTokenResult } from "@/components/mcp/mcp-token-result";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  McpScopeName,
  McpTokenCreated,
  UserSession,
} from "@/services/types/sessions";

export type McpTabState = "loading" | "error" | "ready";

export interface McpTabProps {
  /** `useSessions().data` whole, server order: the tab shows its active `mcp` rows. */
  sessions: readonly UserSession[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** `APP_CONFIG.mcp.endpoint`. */
  endpoint: string;
  /** "Last used" is relative to it (`useMinuteClock()`). */
  now: Date;
  /** Create token: the name as typed and the chosen scope. */
  onCreate: (name: string, scope: McpScopeName[]) => void;
  isCreating?: boolean;
  /** The refusal in words (`apiErrorMessage`): said once, inside the dialog. */
  createError?: string | null;
  /** The 201 answer; while set, the dialog shows the token once. */
  created?: McpTokenCreated | null;
  /** The dialog closed (Done, Cancel, Escape): drop the answer and any refusal (`mutation.reset()`). */
  onCloseResult: () => void;
  /** After the confirm. */
  onRevoke: (session: UserSession) => void;
  /** The id whose DELETE is in flight. */
  revokingId?: string | null;
  className?: string;
}

export function mcpTabState({
  sessions,
  isLoading,
  isError,
}: Pick<McpTabProps, "sessions" | "isLoading" | "isError">): McpTabState {
  if (sessions) return "ready";
  if (isError) return "error";
  return isLoading === false ? "ready" : "loading";
}

/** DeskMcpTab.dc.html's `.card` (r14, surface, shadow-card). */
const CARD = "rounded-[14px] bg-surface shadow-card";
const HINT = "text-[13px] leading-normal text-muted-foreground";
const LINK = "font-medium text-primary hover:text-accent-foreground";

/**
 * Profile › MCP at md and up (DeskMcpTab, DeskCreate, DeskToken): the server
 * address, New token (a dialog: name and scope, then the token once and the
 * configs), and the active MCP connections with Revoke behind a confirm.
 */
export function McpTab({
  sessions,
  isLoading = false,
  isError = false,
  onRetry,
  isRetrying = false,
  endpoint,
  now,
  onCreate,
  isCreating = false,
  createError = null,
  created = null,
  onCloseResult,
  onRevoke,
  revokingId = null,
  className,
}: McpTabProps) {
  const t = useTranslations("mcpTab");
  const tCommon = useTranslations("common");
  const headingId = useId();
  const activeId = useId();
  const activeHeading = useRef<HTMLHeadingElement>(null);
  const newToken = useRef<HTMLButtonElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const address = useRef<HTMLSpanElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const handOffId = useRef<string | null>(null);
  const retried = useRef(false);
  const [open, setOpen] = useState(false);

  const state = mcpTabState({ sessions, isLoading, isError });
  const active = activeMcpSessions(sessions);
  const step = created ? "result" : "create";
  // A token that came back is always shown, even if the dialog was asked to close meanwhile.
  const dialogOpen = open || created !== null;

  // Create token unmounts with the swap: the token's title takes the focus.
  useEffect(() => {
    if (created) resultTitle.current?.focus({ preventScroll: true });
  }, [created]);

  // A revoked row leaves the list and a successful Retry unmounts its button: focus lands on "Active".
  useEffect(() => {
    const armed = handOffId.current;
    const revokedGone =
      armed !== null &&
      !activeMcpSessions(sessions).some((session) => session.id === armed);
    const retryDone = retried.current && state === "ready";
    if (!revokedGone && !retryDone) return;
    handOffId.current = null;
    retried.current = false;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    activeHeading.current?.focus({ preventScroll: true });
  }, [sessions, state]);

  const close = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    if (isCreating) return;
    setOpen(false);
    onCloseResult();
  };

  const createButton = (words: ReactNode, slot: string) => (
    <Button
      ref={slot === "mcp-new-token" ? newToken : undefined}
      type="button"
      data-slot={slot}
      aria-haspopup="dialog"
      className={cn(MCP_DESK_BTN, MCP_DESK_BTN_PRI)}
      onClick={() => setOpen(true)}
    >
      {words}
    </Button>
  );

  return (
    <div
      data-slot="mcp-tab"
      data-state={state}
      className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6", className)}
    >
      <section
        aria-labelledby={headingId}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="min-w-0 flex-[1_1_360px]">
          <h2 id={headingId} className="m-0 text-lg font-bold text-foreground">
            {t("title")}
          </h2>
          <p className={cn(HINT, "mt-1 max-w-[560px]")}>
            {t.rich("deskLead", {
              link: (chunks) => (
                <Link href="/mcp" className={LINK}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        {createButton(
          <>
            <McpNewTokenIcon />
            {t("newToken")}
          </>,
          "mcp-new-token",
        )}
      </section>

      <div
        data-slot="mcp-address"
        className={cn(CARD, "flex flex-wrap items-center gap-4 py-2 pr-2 pl-5")}
      >
        <span className="text-[13px] font-semibold text-muted-foreground">
          {t("serverAddress")}
        </span>
        <span
          ref={address}
          className="min-w-0 flex-1 font-numeric text-[13px] wrap-anywhere text-foreground"
        >
          {endpoint}
        </span>
        <McpCopyButton
          variant="desk-icon"
          text={endpoint}
          label={t("copyAddress")}
          doneLabel={t("addressCopied")}
          selectOnFail={address}
          data-action="copy-address"
        />
      </div>

      <section aria-labelledby={activeId} className="flex flex-col gap-2.5">
        <h3
          ref={activeHeading}
          id={activeId}
          tabIndex={-1}
          className="m-0 text-[15px] font-semibold text-foreground outline-none focus-visible:underline"
        >
          {t("activeTitle")}
        </h3>

        {state === "loading" ? (
          <div role="status" className={cn(CARD, "overflow-hidden")}>
            <span className="sr-only">{t("loading")}</span>
            {[0, 1].map((row) => (
              <div
                key={row}
                aria-hidden
                className="flex flex-wrap items-center gap-x-6 gap-y-3 border-border px-5 py-4 not-first:border-t"
              >
                <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-[10px]" />
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-[22px] w-24 rounded-full" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[0, 1, 2, 3].map((cell) => (
                    <div key={cell} className="flex min-w-24 flex-col gap-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-9 w-20 rounded-[10px]" />
              </div>
            ))}
          </div>
        ) : state === "error" ? (
          <div role="alert" className={cn(CARD, "p-4")}>
            <EmptyState
              icon={CircleAlert}
              title={t("loadErrorTitle")}
              description={t("loadErrorBody")}
              className="border-0 bg-transparent"
              action={
                onRetry ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-disabled={isRetrying || undefined}
                    aria-busy={isRetrying || undefined}
                    className="aria-disabled:opacity-60"
                    onClick={() => {
                      if (isRetrying) return;
                      retried.current = true;
                      onRetry();
                    }}
                  >
                    {isRetrying ? (
                      <LoaderCircle
                        aria-hidden
                        data-icon="inline-start"
                        className="motion-safe:animate-spin"
                      />
                    ) : (
                      <RefreshCw aria-hidden data-icon="inline-start" />
                    )}
                    {t("retry")}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : active.length === 0 ? (
          <div data-slot="mcp-empty" className={cn(CARD, "p-8 text-center")}>
            <p className="m-0 text-[15px] font-semibold text-foreground">
              {t("emptyTitle")}
            </p>
            <p className={cn(HINT, "mt-1")}>{t("deskEmptyBody")}</p>
            <div className="mt-4">
              {createButton(t("createToken"), "mcp-empty-create")}
            </div>
          </div>
        ) : (
          <ul
            data-slot="mcp-connections"
            className={cn(CARD, "m-0 list-none divide-y divide-border p-0")}
          >
            {active.map((session) => (
              <McpRow
                key={session.id}
                session={session}
                now={now}
                pending={revokingId === session.id}
                onRevoke={(row) => {
                  handOffId.current = row.id;
                  onRevoke(row);
                }}
              />
            ))}
          </ul>
        )}

        <p className={cn(HINT, "m-0")}>{t("deskFootHint")}</p>
      </section>

      <Dialog open={dialogOpen} onOpenChange={close}>
        <DialogContent
          showCloseButton={false}
          data-slot="mcp-dialog"
          data-step={step}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // No trigger: Radix would hand focus to <body>; the empty state's button may be gone.
            event.preventDefault();
            const target = opener.current;
            opener.current = null;
            if (target && target !== document.body && target.isConnected) {
              target.focus();
            } else {
              newToken.current?.focus();
            }
          }}
          onPointerDownOutside={(event) => {
            if (step === "result" || isCreating) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isCreating) event.preventDefault();
          }}
          className={cn(
            "flex max-h-[calc(100%-4rem)] flex-col overflow-y-auto rounded-2xl border-0 bg-surface p-6 shadow-elevated",
            step === "result"
              ? "max-h-[calc(100%-3rem)] sm:max-w-[720px]"
              : "sm:max-w-[520px]",
          )}
        >
          {created ? (
            <McpTokenResult
              variant="desktop"
              name={created.name}
              scope={created.scope}
              token={created.token}
              endpoint={endpoint}
              titleRef={resultTitle}
              onDone={() => close(false)}
            />
          ) : (
            <>
              <McpCreateForm
                variant="desktop"
                onSubmit={onCreate}
                onCancel={() => close(false)}
                isCreating={isCreating}
                error={createError}
              />
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={tCommon("close")}
                  className="absolute top-3 right-3 rounded-lg text-muted-foreground"
                >
                  <X aria-hidden="true" className="size-[18px]" />
                </Button>
              </DialogClose>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function McpRow({
  session,
  now,
  pending,
  onRevoke,
}: {
  session: UserSession;
  now: Date;
  pending: boolean;
  onRevoke: (session: UserSession) => void;
}) {
  const t = useTranslations("mcpTab");
  const { date, lastUsed } = useMcpDates(now);

  return (
    <li
      data-slot="mcp-row"
      data-session-id={session.id}
      className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4"
    >
      <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-muted text-primary"
        >
          <McpIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold break-words text-foreground">
            {session.device_name}
          </div>
          <McpScopeChip scope={session.scope} className="mt-1" />
        </div>
      </div>

      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2">
        <Cell term={t("terms.created")}>
          <time dateTime={session.created_at}>{date(session.created_at)}</time>
        </Cell>
        <Cell term={t("terms.lastUsed")}>
          {session.last_used_at ? (
            <time dateTime={session.last_used_at}>
              {lastUsed(session.last_used_at)}
            </time>
          ) : (
            <span className="text-muted-foreground">{t("never")}</span>
          )}
        </Cell>
        <Cell term={t("terms.ip")}>
          {session.last_ip ? (
            <span className="font-numeric wrap-anywhere">
              {session.last_ip}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("notRecorded")}</span>
          )}
        </Cell>
        <Cell term={t("terms.endsIfUnused")}>
          <time dateTime={session.expires_at}>{date(session.expires_at)}</time>
        </Cell>
      </dl>

      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant="secondary"
            data-slot="mcp-revoke"
            aria-label={t("revokeLabel", { name: session.device_name })}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
            className={cn(
              MCP_DESK_BTN,
              "h-9 bg-destructive/16 text-[color:var(--destructive-text)] hover:bg-destructive/25 hover:text-[color:var(--destructive-text)] aria-disabled:opacity-60",
            )}
          >
            {pending ? (
              <LoaderCircle
                aria-hidden
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : null}
            {t("revoke")}
          </Button>
        }
        title={t("revokeTitle", { name: session.device_name })}
        description={t("revokeBody")}
        confirmLabel={t("revokeConfirm")}
        cancelLabel={t("cancel")}
        onConfirm={() => onRevoke(session)}
      />
    </li>
  );
}

function Cell({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-24 flex-col gap-0.5 text-[13px]">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="m-0 text-foreground">{children}</dd>
    </div>
  );
}
