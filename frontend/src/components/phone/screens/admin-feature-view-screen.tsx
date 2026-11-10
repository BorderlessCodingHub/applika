"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Loader2, UserPlus } from "lucide-react";
import {
  addUserResultsState,
  type FeatureAddUserDialogProps,
} from "@/components/admin/feature-add-user-dialog";
import {
  featureBetaListState,
  type FeatureBetaListProps,
} from "@/components/admin/feature-beta-list";
import {
  FEATURE_ADD_USER_COPY,
  FEATURE_BETA_LIST_COPY,
  FEATURE_COPY,
  FEATURE_OWN_ACCESS_COPY,
  FEATURE_STAGE_COPY,
  addUserDescription,
  addUserFailed,
  addUserLabel,
  addUserMore,
  addUserNoMatch,
  addedUserStatus,
  betaListCount,
  betaListGoToPage,
  betaListNoMatchTitle,
  betaUserAddedLine,
  featureAccessKind,
  featureAccessReason,
  featureNotFoundBody,
  featureOwnAccessLock,
  listedUserLabel,
  moveBackTitle,
  releaseBody,
  releaseTitle,
  removeUserBody,
  removeUserFailed,
  removeUserLabel,
  removeUserTitle,
  type FeatureAccess,
  type FeatureBetaUser,
  type FeatureUserCandidate,
  useFeatureCopyLocale,
} from "@/components/admin/feature-copy";
import type { FeatureHeaderProps } from "@/components/admin/feature-header";
import type { FeatureOwnAccessProps } from "@/components/admin/feature-own-access";
import type { FeatureStageActionProps } from "@/components/admin/feature-stage-action";
import { PhonePager } from "@/components/phone/phone-pager";
import { PhonePill } from "@/components/phone/phone-pill";
import {
  PhoneSkeleton,
  PhoneSkeletonCard,
} from "@/components/phone/phone-load";
import {
  PhoneSheetDescription,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "@/components/phone/phone-sheet";
import { PhoneAlertCard } from "@/components/phone/phone-state-card";
import { PhoneSwitch } from "@/components/phone/phone-switch";
import {
  FeatureReleasedWords,
  FeatureStagePill,
} from "@/components/phone/screens/admin-features-screen";
import type { FeatureStage } from "@/services/types/features";

export interface AdminFeatureViewScreenViewProps {
  /** The page's `?key=`, trimmed; `null` when absent. */
  featureKey: string | null;
  /**
   * The page's not-found rule held (no key, a list without the key, a 404 on
   * the beta list): only the not-found page renders. `message` is the 404's
   * words (`serverDetail(users.error)`), else today's "Feature not found".
   */
  notFound?: { message?: string | null } | null;
  /** `FeatureHeader`'s props as the page passes them: `isError` is `headerError`. */
  header: Pick<
    FeatureHeaderProps,
    "feature" | "isLoading" | "isError" | "onRetry" | "isRetrying"
  >;
  /** `FeatureStageAction`'s `onConfirm` (`detailOrThrow(setStage…)`). */
  onStageConfirm: FeatureStageActionProps["onConfirm"];
  /** `FeatureOwnAccess`'s wiring; its stage and `me` are the feature's. */
  ownAccess: Pick<
    FeatureOwnAccessProps,
    "onUseChange" | "pending" | "pendingValue"
  >;
  /** `FeatureBetaList`'s props; its name and stage are the feature's (the key and beta while it loads). */
  betaList: Omit<
    FeatureBetaListProps,
    "featureName" | "stage" | "action" | "className"
  >;
  /** `FeatureAddUserDialog`'s props; its feature name is the feature's. */
  addUser: Omit<FeatureAddUserDialogProps, "featureName" | "className">;
}

/**
 * v3/AdminFeatureView below md: back "Features" and the System pill in the
 * bar (`AdminPhoneHeader`, no chips), then the feature, its stage action,
 * Your access and the Beta list, each change confirmed in a sheet. Props in
 * (the desktop components' own props), the board out.
 */
export function AdminFeatureViewScreenView({
  featureKey,
  notFound,
  header,
  onStageConfirm,
  ownAccess,
  betaList,
  addUser,
}: AdminFeatureViewScreenViewProps) {
  useFeatureCopyLocale();

  if (notFound) {
    return (
      <div
        data-slot="phone-admin-feature"
        data-state="not-found"
        className="ph-app ph-ad-body"
      >
        <div data-slot="feature-not-found">
          <h1 className="ph-h1 ph-h1-26 ph-fv-h1">
            {notFound.message?.trim() || FEATURE_COPY.notFoundTitle}
          </h1>
          <p className="ph-lead">{featureNotFoundBody(featureKey?.trim())}</p>
        </div>
        <Link href="/admin/features" className="ph-btn ph-sec">
          {FEATURE_COPY.backToFeatures}
        </Link>
      </div>
    );
  }

  const feature = header.feature;
  const featureName = feature?.name ?? featureKey ?? "";
  const stage: FeatureStage = feature?.stage ?? "beta";

  return (
    <div data-slot="phone-admin-feature" className="ph-app ph-ad-body">
      <FeatureHead header={header} onStageConfirm={onStageConfirm} />
      {/* A failed features load leaves no stage or name to word the rest with (today's rule). */}
      {header.isError && !feature ? null : (
        <>
          <OwnAccessCard
            stage={feature?.stage}
            me={feature?.me}
            {...ownAccess}
          />
          <BetaListCard
            featureName={featureName}
            stage={stage}
            {...betaList}
            addUser={addUser}
          />
        </>
      )}
    </div>
  );
}

function FeatureHead({
  header,
  onStageConfirm,
}: {
  header: AdminFeatureViewScreenViewProps["header"];
  onStageConfirm: AdminFeatureViewScreenViewProps["onStageConfirm"];
}) {
  useFeatureCopyLocale();
  const { feature, isLoading, isError, onRetry, isRetrying = false } = header;
  const root = useRef<HTMLElement>(null);
  const retried = useRef(false);
  const state =
    isLoading || (!feature && !isError)
      ? "loading"
      : feature
        ? "ready"
        : "error";

  // A Retry that unmounts on success would drop keyboard focus to <body>.
  useEffect(() => {
    if (state !== "ready" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    root.current?.focus({ preventScroll: true });
  }, [state]);

  return (
    <header
      ref={root}
      tabIndex={-1}
      data-slot="feature-header"
      data-state={state}
      className="ph-fv-header ph-focus-target"
    >
      {state === "loading" ? (
        <PhoneSkeleton label={FEATURE_COPY.loading}>
          <PhoneSkeletonCard className="h-[29px] w-3/5 rounded-[8px]" />
          <PhoneSkeletonCard className="h-[45px] rounded-[8px]" />
          <div className="grid grid-cols-2 gap-2">
            <PhoneSkeletonCard className="h-[66px] rounded-[14px]" />
            <PhoneSkeletonCard className="h-[66px] rounded-[14px]" />
          </div>
          <PhoneSkeletonCard className="h-[52px] rounded-[16px]" />
        </PhoneSkeleton>
      ) : state === "error" || !feature ? (
        <PhoneAlertCard
          heading="h1"
          data-slot="feature-header-error"
          title={FEATURE_COPY.loadErrorTitle}
          body={FEATURE_COPY.loadErrorBody}
          retryLabel={FEATURE_COPY.retry}
          retrying={isRetrying}
          onRetry={
            onRetry
              ? () => {
                  retried.current = true;
                  onRetry();
                }
              : undefined
          }
        />
      ) : (
        <>
          <div>
            {/* The pill is a sibling of the h1, never inside it: the heading's name stays exact. */}
            <div className="ph-fv-title">
              <h1 className="ph-h1 ph-h1-26 ph-fv-name">{feature.name}</h1>
              <FeatureStagePill stage={feature.stage} />
            </div>
            <p
              data-slot="feature-description"
              data-empty={feature.description?.trim() ? undefined : ""}
              className="ph-lead ph-fv-lead"
            >
              {feature.description?.trim() || FEATURE_COPY.noDescription}
            </p>
          </div>
          <dl className="ph-dl">
            <div>
              <dt>{FEATURE_COPY.key}</dt>
              <dd data-slot="feature-key" className="ph-mono ph-fv-key">
                {feature.key}
              </dd>
            </div>
            <div>
              <dt>{FEATURE_COPY.released}</dt>
              <dd data-slot="feature-released">
                <FeatureReleasedWords
                  stage={feature.stage}
                  releasedAt={feature.released_at}
                />
              </dd>
            </div>
          </dl>
          <StageAction
            stage={feature.stage}
            featureName={feature.name}
            onConfirm={onStageConfirm}
          />
        </>
      )}
    </header>
  );
}

/** Today's `FeatureStageAction` as the board draws it: the full-width button and its confirm sheet. */
function StageAction({
  stage,
  featureName,
  onConfirm,
}: {
  stage: FeatureStage;
  featureName: string;
  onConfirm: FeatureStageActionProps["onConfirm"];
}) {
  useFeatureCopyLocale();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Frozen on open: the refetch after a confirm flips `stage` while the sheet slides away.
  const [sheetStage, setSheetStage] = useState<FeatureStage>(stage);
  const releasing = stage === "beta";
  const sheetReleasing = sheetStage === "beta";
  const next: FeatureStage = sheetReleasing ? "general" : "beta";
  const lines = sheetReleasing
    ? releaseBody(featureName)
    : ([
        FEATURE_STAGE_COPY.moveBack.loseAccess,
        FEATURE_STAGE_COPY.moveBack.keepList,
      ] as const);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    let message: string | void;
    try {
      message = await onConfirm(next);
    } catch {
      message = FEATURE_STAGE_COPY.failed;
    }
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        data-slot="feature-stage-action"
        data-next-stage={releasing ? "general" : "beta"}
        className={releasing ? "ph-btn ph-pri" : "ph-btn ph-sec"}
        onClick={() => {
          setError(null);
          setSheetStage(stage);
          setOpen(true);
        }}
      >
        {releasing
          ? FEATURE_STAGE_COPY.release.action
          : FEATURE_STAGE_COPY.moveBack.action}
      </button>
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        pending={pending}
        title={
          sheetReleasing
            ? releaseTitle(featureName)
            : moveBackTitle(featureName)
        }
        lines={lines}
        error={error}
        errorSlot="feature-stage-error"
        sheetSlot="feature-stage-sheet"
        nextStage={next}
        cancelLabel={FEATURE_STAGE_COPY.cancel}
        confirmLabel={
          sheetReleasing
            ? FEATURE_STAGE_COPY.release.confirm
            : FEATURE_STAGE_COPY.moveBack.confirm
        }
        confirmClassName="ph-btn ph-pri"
        confirmSlot="feature-stage-confirm"
        onConfirm={() => void confirm()}
      />
    </>
  );
}

/** AdminFeatureView's confirm sheet (l.126-141): an `alertdialog`, Cancel first, the server's words in place. */
function ConfirmSheet({
  open,
  onOpenChange,
  pending,
  title,
  lines,
  error,
  errorSlot,
  sheetSlot,
  nextStage,
  cancelLabel,
  confirmLabel,
  confirmClassName,
  confirmSlot,
  onConfirm,
  fallbackFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  title: ReactNode;
  /** The first line in the text colour, the rest muted. */
  lines: readonly string[];
  error: string | null;
  errorSlot: string;
  sheetSlot: string;
  nextStage?: FeatureStage;
  cancelLabel: string;
  confirmLabel: string;
  confirmClassName: string;
  confirmSlot: string;
  onConfirm: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <PhoneSheetFrame
      open={open}
      alert
      described
      fallbackFocus={fallbackFocus}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <span className="ph-grab" aria-hidden="true" />
      <PhoneSheetTitle className="ph-h2 ph-fv-sheet-h">{title}</PhoneSheetTitle>
      <div
        data-slot={sheetSlot}
        data-next-stage={nextStage}
        className="ph-fv-confirm"
      >
        {/* One <p> per sentence, so each can be asserted whole. */}
        <PhoneSheetDescription asChild>
          <div className="ph-fv-lines">
            {lines.map((line, index) => (
              <p key={line} className={index > 0 ? "ph-fv-muted" : undefined}>
                {line}
              </p>
            ))}
          </div>
        </PhoneSheetDescription>
        {error ? (
          <div
            role="alert"
            data-slot={errorSlot}
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
        <div className="ph-fv-actions">
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
            {cancelLabel}
          </button>
          <button
            type="button"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            data-disabled={pending || undefined}
            data-slot={confirmSlot}
            className={confirmClassName}
            onClick={() => {
              if (!pending) onConfirm();
            }}
          >
            {pending ? (
              <Loader2 size={16} aria-hidden="true" className="ph-spin" />
            ) : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </PhoneSheetFrame>
  );
}

/** "Your access" (l.85-98): the reason, "Use this feature myself" and why it is locked. */
function OwnAccessCard({
  stage,
  me,
  onUseChange,
  pending = false,
  pendingValue,
}: {
  stage: FeatureStage | undefined;
  me: FeatureAccess | undefined;
} & AdminFeatureViewScreenViewProps["ownAccess"]) {
  useFeatureCopyLocale();
  const headingId = useId();
  const switchId = useId();
  const hintId = useId();

  if (!me || !stage) {
    return (
      <section
        aria-labelledby={headingId}
        data-slot="feature-own-access"
        data-state="loading"
        className="ph-card ph-fv-card"
      >
        <h2 id={headingId} className="ph-fv-card-h">
          {FEATURE_OWN_ACCESS_COPY.title}
        </h2>
        <PhoneSkeleton label={FEATURE_OWN_ACCESS_COPY.loading}>
          <PhoneSkeletonCard className="h-[21px] rounded-[8px] bg-muted shadow-none" />
          <PhoneSkeletonCard className="h-[32px] rounded-[8px] bg-muted shadow-none" />
          <PhoneSkeletonCard className="h-[38px] rounded-[8px] bg-muted shadow-none" />
        </PhoneSkeleton>
      </section>
    );
  }

  const kind = featureAccessKind(me);
  const lock = featureOwnAccessLock(stage, me);
  // The switch shows the STORED choice in every stage; while saving, the asked-for one.
  const stored = !me.opted_out;
  const checked = pending && pendingValue !== undefined ? pendingValue : stored;
  const unavailable = pending || lock !== null;
  const hint =
    lock === "general"
      ? FEATURE_OWN_ACCESS_COPY.lockedGeneral
      : lock === "list"
        ? FEATURE_OWN_ACCESS_COPY.lockedList
        : FEATURE_OWN_ACCESS_COPY.hint;

  return (
    <section
      aria-labelledby={headingId}
      data-slot="feature-own-access"
      data-state="ready"
      data-access={kind}
      data-lock={lock ?? undefined}
      className="ph-card ph-fv-card"
    >
      <h2 id={headingId} className="ph-fv-card-h">
        {FEATURE_OWN_ACCESS_COPY.title}
      </h2>
      {/* Live: focus stays on the switch, so the new reason is announced, not seen. */}
      <p
        aria-live="polite"
        aria-atomic="true"
        data-slot="feature-own-access-reason"
        className="ph-fv-reason"
      >
        {featureAccessReason(me)}
      </p>
      <div className="ph-fv-switch-row">
        <label htmlFor={switchId} className="ph-fv-switch-l">
          {FEATURE_OWN_ACCESS_COPY.switchLabel}
        </label>
        {/* aria-disabled, not disabled: a locked switch stays focusable so its reason is read with it. */}
        <PhoneSwitch
          id={switchId}
          checked={checked}
          aria-describedby={hintId}
          aria-disabled={unavailable || undefined}
          aria-busy={pending || undefined}
          data-lock={lock ?? undefined}
          data-action="use-feature"
          className="ph-fv-switch"
          onCheckedChange={(value) => {
            if (!unavailable) onUseChange(value);
          }}
        />
      </div>
      <p
        id={hintId}
        data-slot="feature-own-access-hint"
        data-lock={lock ?? undefined}
        className="ph-hint"
      >
        {hint}
      </p>
    </section>
  );
}

type BetaListCardProps = Omit<FeatureBetaListProps, "action" | "className"> & {
  addUser: AdminFeatureViewScreenViewProps["addUser"];
};

/** "Beta list" (l.100-123): count, search, Add user, the members, Remove behind a sheet, pages. */
function BetaListCard({
  featureName,
  stage,
  result,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  isRetrying = false,
  isRefreshing = false,
  search,
  onSearchChange,
  onPageChange,
  onRemove,
  addUser,
}: BetaListCardProps) {
  useFeatureCopyLocale();
  const headingId = useId();
  const searchId = useId();
  const section = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const retried = useRef(false);
  const handOff = useRef<string | null>(null);
  const state = featureBetaListState({ result, search, isLoading, isError });

  const [removing, setRemoving] = useState<FeatureBetaUser | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // A Retry that unmounts on success would drop keyboard focus to <body>.
  useEffect(() => {
    if (state === "error" || state === "loading" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    section.current?.focus({ preventScroll: true });
  }, [state]);

  // A removed row takes its Remove with it: land on the search, never on a refetch.
  useEffect(() => {
    const id = handOff.current;
    if (!id || !result || result.items.some((u) => u.user_id === id)) return;
    handOff.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    searchInput.current?.focus({ preventScroll: true });
  }, [result]);

  const confirmRemove = async () => {
    const user = removing;
    if (!user || removePending) return;
    setRemovePending(true);
    setRemoveError(null);
    handOff.current = user.user_id;
    let message: string | void;
    try {
      message = await onRemove(user);
    } catch {
      message = removeUserFailed(user.username);
    }
    setRemovePending(false);
    if (message) {
      handOff.current = null;
      setRemoveError(message);
      return;
    }
    setRemoveOpen(false);
  };

  const page = result?.page ?? 1;
  const totalPages = result?.total_pages ?? 0;
  const paged = state === "ready" && totalPages > 1;

  return (
    <section
      ref={section}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-slot="feature-beta-list"
      data-state={state}
      className="ph-card ph-fv-card ph-focus-target"
    >
      <div className="ph-fv-card-head">
        <h2 id={headingId} className="ph-fv-card-h">
          {FEATURE_BETA_LIST_COPY.title}
        </h2>
        <span
          aria-live="polite"
          data-slot="feature-beta-list-count"
          className="ph-mono ph-fv-count"
        >
          {result && (state === "ready" || state === "page-empty")
            ? betaListCount(result.total)
            : null}
        </span>
      </div>
      <p className="ph-hint">{FEATURE_BETA_LIST_COPY.description[stage]}</p>
      <div className="ph-fv-tools">
        <div className="ph-field ph-fv-search">
          <label htmlFor={searchId} className="ph-sr">
            {FEATURE_BETA_LIST_COPY.searchLabel}
          </label>
          <input
            ref={searchInput}
            id={searchId}
            type="search"
            enterKeyHint="search"
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            placeholder={FEATURE_BETA_LIST_COPY.searchPlaceholder}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            data-slot="feature-beta-list-search"
            className="ph-input ph-fv-search-input"
          />
        </div>
        <button
          ref={addButton}
          type="button"
          aria-haspopup="dialog"
          data-slot="feature-add-user"
          className="ph-btn ph-sec ph-sm ph-fv-add"
          onClick={() => setAddOpen(true)}
        >
          <UserPlus size={16} aria-hidden="true" />
          {FEATURE_ADD_USER_COPY.trigger}
        </button>
      </div>

      {state === "loading" ? (
        <div className="ph-fv-state ph-fv-loading">
          <PhoneSkeleton label={FEATURE_BETA_LIST_COPY.loading}>
            <PhoneSkeletonCard className="h-[58px] rounded-[12px] bg-muted shadow-none" />
            <PhoneSkeletonCard className="h-[58px] rounded-[12px] bg-muted shadow-none" />
            <PhoneSkeletonCard className="h-[58px] rounded-[12px] bg-muted shadow-none" />
          </PhoneSkeleton>
        </div>
      ) : state === "error" ? (
        <div role="alert" className="ph-fv-state">
          <p className="ph-fv-state-t">
            {FEATURE_BETA_LIST_COPY.loadErrorTitle}
          </p>
          <p data-slot="feature-beta-list-error" className="ph-hint">
            {errorMessage?.trim() || FEATURE_BETA_LIST_COPY.loadErrorBody}
          </p>
          {onRetry ? (
            <button
              type="button"
              aria-disabled={isRetrying || undefined}
              aria-busy={isRetrying || undefined}
              data-action="retry"
              className="ph-btn ph-sec ph-sm"
              onClick={() => {
                if (isRetrying) return;
                retried.current = true;
                onRetry();
              }}
            >
              {isRetrying ? (
                <Loader2 size={16} aria-hidden="true" className="ph-spin" />
              ) : null}
              {FEATURE_BETA_LIST_COPY.retry}
            </button>
          ) : null}
        </div>
      ) : state === "empty" ? (
        <div data-reason="empty" className="ph-fv-state">
          <p className="ph-fv-state-t">{FEATURE_BETA_LIST_COPY.emptyTitle}</p>
          <p className="ph-hint">{FEATURE_BETA_LIST_COPY.emptyBody}</p>
        </div>
      ) : state === "no-match" ? (
        <div data-reason="no-match" className="ph-fv-state">
          <p className="ph-fv-state-t">{betaListNoMatchTitle(search)}</p>
          <p className="ph-hint">{FEATURE_BETA_LIST_COPY.noMatchBody}</p>
          <button
            type="button"
            className="ph-btn ph-sec ph-sm"
            onClick={() => {
              onSearchChange("");
              searchInput.current?.focus();
            }}
          >
            {FEATURE_BETA_LIST_COPY.clearSearch}
          </button>
        </div>
      ) : state === "page-empty" ? (
        <div data-reason="page-empty" className="ph-fv-state">
          <p className="ph-fv-state-t">
            {FEATURE_BETA_LIST_COPY.pageEmptyTitle}
          </p>
          <button
            type="button"
            className="ph-btn ph-sec ph-sm"
            onClick={() => onPageChange(Math.max(1, totalPages))}
          >
            {betaListGoToPage(Math.max(1, totalPages))}
          </button>
        </div>
      ) : (
        <ul
          data-slot="feature-beta-users"
          data-refreshing={isRefreshing || undefined}
          data-paged={paged || undefined}
          aria-busy={isRefreshing || undefined}
          className="ph-fv-members"
        >
          {result?.items.map((user) => (
            <li
              key={user.user_id}
              data-slot="feature-beta-user"
              data-user-id={user.user_id}
              data-username={user.username}
              className="ph-fv-member"
            >
              <div className="ph-fv-who">
                <div className="ph-fv-user">{user.username}</div>
                <div className="ph-fv-email">{user.email}</div>
                {/* One text node: an exact date/username match never hits it in tests. */}
                <div
                  data-slot="feature-beta-user-added-line"
                  className="ph-fv-added"
                >
                  {betaUserAddedLine(user.added_at, user.added_by?.username)}
                </div>
              </div>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={removeUserLabel(user.username)}
                data-slot="feature-beta-user-remove"
                className="ph-btn ph-dan ph-sm ph-fv-remove"
                onClick={() => {
                  setRemoving(user);
                  setRemoveError(null);
                  setRemoveOpen(true);
                }}
              >
                {FEATURE_BETA_LIST_COPY.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      {paged ? (
        <PhonePager
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
          label={FEATURE_BETA_LIST_COPY.pagerLabel}
          className="ph-fv-pager"
        />
      ) : null}

      <ConfirmSheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        pending={removePending}
        title={removing ? removeUserTitle(removing.username) : null}
        lines={
          removing
            ? [removeUserBody(removing.username, featureName, stage)]
            : []
        }
        error={removeError}
        errorSlot="feature-beta-user-error"
        sheetSlot="feature-beta-user-remove-sheet"
        cancelLabel={FEATURE_BETA_LIST_COPY.cancel}
        confirmLabel={FEATURE_BETA_LIST_COPY.remove}
        confirmClassName="ph-btn ph-dan"
        confirmSlot="feature-beta-user-remove-confirm"
        fallbackFocus={searchInput}
        onConfirm={() => void confirmRemove()}
      />

      <AddUserSheet
        sheetOpen={addOpen}
        onSheetOpenChange={setAddOpen}
        featureName={featureName}
        fallbackFocus={addButton}
        {...addUser}
      />
    </section>
  );
}

/** "Add users to the beta list" (l.143-160): search every user, Add or "On the list", Done. */
function AddUserSheet({
  sheetOpen,
  onSheetOpenChange,
  fallbackFocus,
  featureName,
  search,
  onSearchChange,
  users,
  total,
  isLoading = false,
  isError = false,
  onRetry,
  isRetrying = false,
  isRefreshing = false,
  listedUserIds = [],
  onAdd,
  onOpenChange,
}: Omit<FeatureAddUserDialogProps, "className"> & {
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  fallbackFocus: RefObject<HTMLElement | null>;
}) {
  useFeatureCopyLocale();
  const searchId = useId();
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const [addedIds, setAddedIds] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = addUserResultsState({ users, search, isLoading, isError });

  const handleOpenChange = (value: boolean) => {
    onSheetOpenChange(value);
    if (value) {
      setStatus(null);
      setError(null);
      setAddedIds([]);
    } else {
      onSearchChange("");
    }
    onOpenChange?.(value);
  };

  const add = async (user: FeatureUserCandidate) => {
    if (pendingIds.includes(user.id)) return;
    setPendingIds((ids) => [...ids, user.id]);
    setStatus(null);
    setError(null);
    let message: string | void;
    try {
      message = await onAdd(user);
    } catch {
      message = addUserFailed(user.username);
    }
    setPendingIds((ids) => ids.filter((id) => id !== user.id));
    if (message) {
      setError(message);
      return;
    }
    setAddedIds((ids) => (ids.includes(user.id) ? ids : [...ids, user.id]));
    setStatus(addedUserStatus(user.username));
  };

  return (
    <PhoneSheetFrame
      open={sheetOpen}
      onOpenChange={handleOpenChange}
      described
      fallbackFocus={fallbackFocus}
    >
      <span className="ph-grab" aria-hidden="true" />
      <PhoneSheetTitle className="ph-h2 ph-fv-sheet-h">
        {FEATURE_ADD_USER_COPY.title}
      </PhoneSheetTitle>
      <div data-slot="feature-add-user-sheet" className="ph-fv-add-body">
        <PhoneSheetDescription className="ph-hint ph-fv-add-hint">
          {addUserDescription(featureName)}
        </PhoneSheetDescription>
        <div className="ph-field">
          <label htmlFor={searchId} className="ph-lbl">
            {FEATURE_ADD_USER_COPY.searchLabel}
          </label>
          <input
            id={searchId}
            type="search"
            enterKeyHint="search"
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            placeholder={FEATURE_ADD_USER_COPY.searchPlaceholder}
            value={search}
            onChange={(event) => {
              setError(null);
              onSearchChange(event.target.value);
            }}
            data-slot="feature-add-user-search"
            className="ph-input"
          />
        </div>

        <div
          data-slot="feature-add-user-results"
          data-state={state}
          data-refreshing={isRefreshing || undefined}
          aria-busy={isRefreshing || undefined}
          className="ph-scroll ph-fv-found"
        >
          {state === "idle" ? (
            <p className="ph-fv-found-note">{FEATURE_ADD_USER_COPY.idle}</p>
          ) : state === "loading" ? (
            <div className="ph-fv-found-pad">
              <PhoneSkeleton label={FEATURE_ADD_USER_COPY.loading}>
                <PhoneSkeletonCard className="h-[44px] rounded-[10px] bg-muted shadow-none" />
                <PhoneSkeletonCard className="h-[44px] rounded-[10px] bg-muted shadow-none" />
                <PhoneSkeletonCard className="h-[44px] rounded-[10px] bg-muted shadow-none" />
              </PhoneSkeleton>
            </div>
          ) : state === "error" ? (
            <div role="alert" className="ph-fv-found-note ph-fv-found-alert">
              <p>{FEATURE_ADD_USER_COPY.errorTitle}</p>
              {onRetry ? (
                <button
                  type="button"
                  aria-disabled={isRetrying || undefined}
                  aria-busy={isRetrying || undefined}
                  data-action="retry"
                  className="ph-btn ph-sec ph-sm"
                  onClick={() => {
                    if (!isRetrying) onRetry();
                  }}
                >
                  {isRetrying ? (
                    <Loader2 size={16} aria-hidden="true" className="ph-spin" />
                  ) : null}
                  {FEATURE_ADD_USER_COPY.retry}
                </button>
              ) : null}
            </div>
          ) : state === "empty" ? (
            <p className="ph-fv-found-note">{addUserNoMatch(search)}</p>
          ) : (
            <>
              <ul className="ph-fv-found-list">
                {users?.map((user) => (
                  <CandidateRow
                    key={user.id}
                    user={user}
                    listed={
                      listedUserIds.includes(user.id) ||
                      addedIds.includes(user.id)
                    }
                    pending={pendingIds.includes(user.id)}
                    onAdd={() => void add(user)}
                  />
                ))}
              </ul>
              {users && total !== undefined && total > users.length ? (
                <p className="ph-hint ph-fv-found-more">
                  {addUserMore(users.length, total)}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Always mounted (never display:none), so the first "added" is announced. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          data-slot="feature-add-user-status"
          className="ph-fv-status"
        >
          {status ? (
            <p className="ph-fv-status-p">
              <CircleCheck size={16} aria-hidden="true" className="ph-fv-ok" />
              <span>{status}</span>
            </p>
          ) : null}
        </div>
        {error ? (
          <div
            role="alert"
            data-slot="feature-add-user-error"
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

        <button
          type="button"
          data-action="add-user-done"
          className="ph-btn ph-sec"
          onClick={() => handleOpenChange(false)}
        >
          {FEATURE_ADD_USER_COPY.done}
        </button>
      </div>
    </PhoneSheetFrame>
  );
}

/** A found user: one button through Add, adding and "On the list", so focus never leaves it. */
function CandidateRow({
  user,
  listed,
  pending,
  onAdd,
}: {
  user: FeatureUserCandidate;
  listed: boolean;
  pending: boolean;
  onAdd: () => void;
}) {
  useFeatureCopyLocale();
  const busy = pending || listed;

  return (
    <li
      data-slot="feature-add-user-row"
      data-user-id={user.id}
      data-username={user.username}
      data-listed={listed}
      className="ph-fv-cand"
    >
      <div className="ph-fv-who">
        <div className="ph-fv-cand-top">
          <span className="ph-fv-user">{user.username}</span>
          {user.is_admin ? (
            <PhonePill>{FEATURE_ADD_USER_COPY.admin}</PhonePill>
          ) : null}
        </div>
        <div className="ph-fv-email">{user.email}</div>
      </div>
      <button
        type="button"
        aria-label={
          listed ? listedUserLabel(user.username) : addUserLabel(user.username)
        }
        aria-disabled={busy || undefined}
        aria-busy={pending || undefined}
        data-disabled={pending || undefined}
        data-slot="feature-add-user-action"
        data-listed={listed}
        className={
          listed ? "ph-hit ph-fv-listed" : "ph-btn ph-pri ph-sm ph-fv-cand-add"
        }
        onClick={() => {
          if (!busy) onAdd();
        }}
      >
        {listed ? (
          <span className="ph-pill ph-ok">{FEATURE_ADD_USER_COPY.listed}</span>
        ) : (
          <>
            {pending ? (
              <Loader2 size={16} aria-hidden="true" className="ph-spin" />
            ) : null}
            {FEATURE_ADD_USER_COPY.add}
          </>
        )}
      </button>
    </li>
  );
}
