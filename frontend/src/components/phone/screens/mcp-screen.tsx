"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { McpCopyButton } from "@/components/mcp/mcp-copy-button";
import {
  McpCreateForm,
  McpNewTokenIcon,
} from "@/components/mcp/mcp-create-form";
import { activeMcpSessions, useMcpDates } from "@/components/mcp/mcp-format";
import { McpIcon } from "@/components/mcp/mcp-icon";
import { McpScopeChip } from "@/components/mcp/mcp-scope-chip";
import { McpTokenResult } from "@/components/mcp/mcp-token-result";
import { PhoneConfirmSheet } from "@/components/phone/phone-confirm-sheet";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { fromQuery } from "@/components/phone/phone-query-load";
import { PhoneSheetFrame } from "@/components/phone/phone-sheet";
import {
  ProfileSectionsNav,
  type ProfileSection,
} from "@/components/phone/screens/profile-screen";
import { APP_CONFIG } from "@/config";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import {
  mcpCreateErrorMessage,
  useCreateMcpToken,
  useRevokeSession,
  useSessions,
} from "@/hooks/use-sessions";
import { cn } from "@/lib/utils";
import type {
  McpScopeName,
  McpTokenCreated,
  UserSession,
} from "@/services/types/sessions";

export interface McpScreenViewProps {
  /** `fromQuery(useSessions())` whole, server order: the screen shows its active `mcp` rows. */
  sessions: PhoneLoad<readonly UserSession[]>;
  /** `APP_CONFIG.mcp.endpoint`. */
  endpoint: string;
  /** "Last used" is relative to it (`useMinuteClock()`). */
  now: Date;
  /** Create token: the name as typed and the chosen scope. */
  onCreate: (name: string, scope: McpScopeName[]) => void;
  isCreating?: boolean;
  /** The refusal in words (`apiErrorMessage`): said once, inside the sheet. */
  createError?: string | null;
  /** The 201 answer; while set, the sheet shows the token once. */
  created?: McpTokenCreated | null;
  /** The sheet closed (Done, Cancel, a swipe or Escape): drop the answer and any refusal (`mutation.reset()`). */
  onCloseResult: () => void;
  /** After the confirm sheet. */
  onRevoke: (session: UserSession) => void;
  /** The id whose DELETE is in flight. */
  revokingId?: string | null;
  /** See `ProfileSectionsNavProps`. */
  onSelectSection?: (section: ProfileSection) => void;
  focusSections?: boolean;
}

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

/**
 * Profile › MCP below md (Main, McpEmpty; McpCreate and McpToken in one
 * sheet): props in, the boards out. The shell draws the "Account" back bar.
 */
export function McpScreenView({
  sessions,
  endpoint,
  now,
  onCreate,
  isCreating = false,
  createError = null,
  created = null,
  onCloseResult,
  onRevoke,
  revokingId = null,
  onSelectSection,
  focusSections,
}: McpScreenViewProps) {
  const t = useTranslations("mcpTab");
  const headingId = useId();
  const activeId = useId();
  const emptyId = useId();
  const activeHeading = useRef<HTMLHeadingElement>(null);
  const emptyHeading = useRef<HTMLHeadingElement>(null);
  const newToken = useRef<HTMLButtonElement>(null);
  const sheetTitle = useRef<HTMLHeadingElement>(null);
  const address = useRef<HTMLDivElement>(null);
  const handOff = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  // The confirm's subject outlives `open`, so the closing sheet keeps its words.
  const [confirm, setConfirm] = useState<UserSession | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const list = sessions.status === "ready" ? sessions.data : null;
  const active = activeMcpSessions(list ?? undefined);
  const empty = list !== null && active.length === 0;
  const step = created ? "result" : "create";
  // A token that came back is always shown, even if the sheet was asked to close meanwhile.
  const sheetOpen = open || created !== null;

  // Create token unmounts with the swap: the token's title takes the focus.
  useEffect(() => {
    if (created) sheetTitle.current?.focus({ preventScroll: true });
  }, [created]);

  // A revoked card leaves the list after the sheet handed focus back to it: focus lands on a heading.
  useEffect(() => {
    const armed = handOff.current;
    if (armed === null || list === null) return;
    if (activeMcpSessions(list).some((session) => session.id === armed)) {
      return;
    }
    handOff.current = null;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    (activeHeading.current ?? emptyHeading.current)?.focus({
      preventScroll: true,
    });
  }, [list]);

  const changeSheet = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    if (isCreating) return;
    setOpen(false);
    onCloseResult();
  };

  const link = (chunks: ReactNode) => (
    <Link href="/mcp" className="ph-mt-inline-link">
      {chunks}
    </Link>
  );

  return (
    <div data-slot="phone-mcp" className="ph-app ph-pf">
      <ProfileSectionsNav
        current="mcp"
        onSelect={onSelectSection}
        focusOnMount={focusSections}
      />

      {empty ? (
        <>
          <section
            aria-labelledby={emptyId}
            data-slot="mcp-empty"
            className="ph-card ph-mt-empty"
          >
            <span aria-hidden="true" className="ph-mt-empty-ic">
              <McpIcon size={26} />
            </span>
            <h1
              ref={emptyHeading}
              id={emptyId}
              tabIndex={-1}
              className="ph-h2 ph-mt-empty-h ph-focus-target"
            >
              {t("emptyTitle")}
            </h1>
            <p className="ph-hint ph-mt-empty-b">{t("emptyBody")}</p>
            <ol className="ph-mt-steps">
              {(["step1", "step2", "step3"] as const).map((key, index) => (
                <li key={key} className="ph-mt-step">
                  <span className="ph-mt-n">{index + 1}</span>
                  <span>{t.rich(key, { strong })}</span>
                </li>
              ))}
            </ol>
            <button
              ref={newToken}
              type="button"
              aria-haspopup="dialog"
              data-slot="mcp-empty-create"
              className="ph-btn ph-pri ph-mt-empty-cta"
              onClick={() => setOpen(true)}
            >
              {t("createToken")}
            </button>
            <Link href="/mcp" className="ph-mt-empty-link">
              {t("whatIsMcp")}
            </Link>
          </section>
          <p className="ph-hint ph-mt-empty-addr">
            {t("serverAddress")}{" "}
            <span className="ph-mono ph-strong">{endpoint}</span>
          </p>
        </>
      ) : (
        <>
          <section aria-labelledby={headingId} className="ph-mt-sec">
            <div>
              <h1 id={headingId} className="ph-h2">
                {t("title")}
              </h1>
              <p className="ph-hint ph-dv-lead">{t("lead")}</p>
            </div>
            <div data-slot="mcp-address" className="ph-card ph-mt-addr">
              <div className="ph-mt-addr-text">
                <div className="ph-mt-addr-lbl">{t("serverAddress")}</div>
                <div ref={address} className="ph-mono ph-hs ph-mt-addr-url">
                  {endpoint}
                </div>
              </div>
              <McpCopyButton
                variant="phone"
                className="ph-mt-copy"
                text={endpoint}
                label={t("copyAddress")}
                doneLabel={t("addressCopied")}
                selectOnFail={address}
                data-action="copy-address"
              />
            </div>
            <button
              ref={newToken}
              type="button"
              aria-haspopup="dialog"
              data-slot="mcp-new-token"
              className="ph-btn ph-pri"
              onClick={() => setOpen(true)}
            >
              <McpNewTokenIcon phone />
              {t("newToken")}
            </button>
          </section>

          <section aria-labelledby={activeId} className="ph-dv-section">
            <h2
              ref={activeHeading}
              id={activeId}
              tabIndex={-1}
              className="ph-h2 ph-mt-h2 ph-focus-target"
            >
              {t("activeTitle")}
            </h2>
            <PhoneLoadable
              state={sessions}
              loading={
                <PhoneSkeleton label={t("loading")}>
                  <PhoneSkeletonCard className="h-[218px]" />
                  <PhoneSkeletonCard className="h-[218px]" />
                </PhoneSkeleton>
              }
            >
              {() => (
                <ul data-slot="mcp-connections" className="ph-dv-list">
                  {active.map((session) => (
                    <McpCard
                      key={session.id}
                      session={session}
                      now={now}
                      pending={revokingId === session.id}
                      onAsk={() => {
                        setConfirm(session);
                        setConfirmOpen(true);
                      }}
                    />
                  ))}
                </ul>
              )}
            </PhoneLoadable>
            <p className="ph-hint">{t.rich("footHint", { link })}</p>
          </section>
        </>
      )}

      <PhoneSheetFrame
        open={sheetOpen}
        onOpenChange={changeSheet}
        described
        initialFocus={sheetTitle}
        keepOnScrim={step === "result" || isCreating}
        fallbackFocus={newToken}
        className={cn("ph-mt-sheet", step === "result" && "ph-mt-sheet-tall")}
      >
        <span className="ph-grab" aria-hidden="true" />
        {created ? (
          <McpTokenResult
            variant="phone"
            name={created.name}
            scope={created.scope}
            token={created.token}
            endpoint={endpoint}
            titleRef={sheetTitle}
            onDone={() => changeSheet(false)}
          />
        ) : (
          <McpCreateForm
            variant="phone"
            titleRef={sheetTitle}
            onSubmit={onCreate}
            onCancel={() => changeSheet(false)}
            isCreating={isCreating}
            error={createError}
          />
        )}
      </PhoneSheetFrame>

      <PhoneConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("revokeTitle", { name: confirm?.device_name ?? "" })}
        description={t("revokeBody")}
        cancelLabel={t("cancel")}
        confirmLabel={t("revokeConfirm")}
        tone="danger"
        confirmAction="confirm-revoke-mcp"
        fallbackFocus={activeHeading}
        onConfirm={() => {
          setConfirmOpen(false);
          if (!confirm) return;
          handOff.current = confirm.id;
          onRevoke(confirm);
        }}
      />
    </div>
  );
}

function McpCard({
  session,
  now,
  pending,
  onAsk,
}: {
  session: UserSession;
  now: Date;
  pending: boolean;
  onAsk: () => void;
}) {
  const t = useTranslations("mcpTab");
  const { date, lastUsed } = useMcpDates(now);

  return (
    <li
      data-slot="mcp-row"
      data-session-id={session.id}
      className="ph-card ph-dv-card"
    >
      <div className="ph-dv-head">
        <span aria-hidden="true" className="ph-dv-ic ph-mt-ic">
          <McpIcon size={18} />
        </span>
        <div className="ph-dv-who">
          <div className="ph-mt-name">{session.device_name}</div>
          <div className="ph-mt-pills">
            <McpScopeChip variant="phone" scope={session.scope} />
          </div>
        </div>
      </div>
      <dl className="ph-dv-dl">
        <dt>{t("terms.created")}</dt>
        <dd>
          <time dateTime={session.created_at}>{date(session.created_at)}</time>
        </dd>
        <dt>{t("terms.lastUsed")}</dt>
        <dd>
          {session.last_used_at ? (
            <time dateTime={session.last_used_at}>
              {lastUsed(session.last_used_at)}
            </time>
          ) : (
            t("never")
          )}
        </dd>
        <dt>{t("terms.ip")}</dt>
        <dd className={cn(session.last_ip && "ph-mono")}>
          {session.last_ip ?? t("notRecorded")}
        </dd>
        <dt>{t("terms.ends")}</dt>
        <dd>
          <time dateTime={session.expires_at}>
            {t("endsValue", { date: date(session.expires_at) })}
          </time>
        </dd>
      </dl>
      <button
        type="button"
        data-slot="mcp-revoke"
        aria-haspopup="dialog"
        aria-label={t("revokeLabel", { name: session.device_name })}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        data-disabled={pending || undefined}
        className="ph-btn ph-dan ph-sm"
        onClick={() => {
          if (!pending) onAsk();
        }}
      >
        {pending ? (
          <Loader2 size={16} aria-hidden="true" className="ph-spin" />
        ) : null}
        {t("revoke")}
      </button>
    </li>
  );
}

export interface McpScreenProps {
  onSelectSection?: (section: ProfileSection) => void;
  focusSections?: boolean;
}

/**
 * Profile › MCP with its data (`/profile?tab=mcp` below md): the sessions
 * list (the MCP rows), Create token and Revoke. The token lives in the
 * mutation's state only while the sheet shows it; closing the sheet resets
 * it. The list is fetched once this section shows.
 */
export function McpScreen({ onSelectSection, focusSections }: McpScreenProps) {
  const sessions = useSessions();
  const create = useCreateMcpToken();
  const revoke = useRevokeSession();
  const now = useMinuteClock();

  return (
    <McpScreenView
      sessions={fromQuery(sessions)}
      endpoint={APP_CONFIG.mcp.endpoint}
      now={now}
      onCreate={(name, scope) => create.mutate({ name, scope })}
      isCreating={create.isPending}
      createError={create.error ? mcpCreateErrorMessage(create.error) : null}
      created={create.data ?? null}
      onCloseResult={create.reset}
      onRevoke={(session) => revoke.mutate(session)}
      revokingId={revoke.isPending ? (revoke.variables?.id ?? null) : null}
      onSelectSection={onSelectSection}
      focusSections={focusSections}
    />
  );
}
