"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Search,
  SearchX,
  UserMinus,
  Users,
} from "lucide-react";

import { AddedBy } from "@/components/admin/catalog-visibility";
import {
  FEATURE_BETA_LIST_COPY,
  betaListCount,
  betaListGoToPage,
  betaListNoMatchTitle,
  betaListPageLabel,
  betaUserAddedLine,
  formatFeatureDate,
  removeUserBody,
  removeUserFailed,
  removeUserLabel,
  removeUserTitle,
  type FeatureBetaUser,
  type FeatureBetaUsersResult,
  useFeatureCopyLocale,
} from "@/components/admin/feature-copy";
import { RetryButton } from "@/components/admin/feature-table";
import { EmptyState } from "@/components/common/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FeatureStage } from "@/services/types/features";

export type FeatureBetaListState =
  | "loading"
  | "error"
  | "empty"
  | "no-match"
  | "page-empty"
  | "ready";

export function featureBetaListState({
  result,
  search,
  isLoading,
  isError,
}: {
  result: FeatureBetaUsersResult | undefined;
  search: string;
  isLoading?: boolean;
  isError?: boolean;
}): FeatureBetaListState {
  if (isLoading) return "loading";
  if (!result) return isError ? "error" : "loading";
  if (result.items.length > 0) return "ready";
  if (result.total > 0) return "page-empty";
  return search.trim() ? "no-match" : "empty";
}

export interface FeatureBetaListProps {
  featureName: string;
  stage: FeatureStage;
  /** `GET /admin/features/{key}/users` for the current search and page. */
  result: FeatureBetaUsersResult | undefined;
  isLoading?: boolean;
  isError?: boolean;
  /** A failed load in words (by its code, `api-error-message.ts`), e.g. "Feature not found". */
  errorMessage?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** A refetch with the last result still on screen (search, page, after a change): dims the rows. */
  isRefreshing?: boolean;
  search: string;
  /** Reset to page 1 on change. */
  onSearchChange: (search: string) => void;
  onPageChange: (page: number) => void;
  /**
   * `DELETE /admin/features/{key}/users/{user_id}`. Resolve with nothing to
   * close the confirm; resolve with a message (the server's `detail`,
   * verbatim) to keep it open and show it. A rejection shows a generic message.
   */
  onRemove: (user: FeatureBetaUser) => Promise<string | void>;
  /** Right of the heading: the "Add user" dialog (`FeatureAddUserDialog`). */
  action?: ReactNode;
  className?: string;
}

const HEAD =
  "h-10 px-3 align-middle font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase";
const CELL = "px-3 py-3 align-top";
/** Below `lg` (the rail takes 240px from `md`) these columns fold into the username cell, so Remove stays on screen. */
const FOLDED = "hidden lg:table-cell";

/** AC2/AC4: the beta list, searchable by username, 25 per page, remove behind a confirm. */
export function FeatureBetaList({
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
  action,
  className,
}: FeatureBetaListProps) {
  useFeatureCopyLocale();
  const headingId = useId();
  const captionId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const retried = useRef(false);
  const handOffId = useRef<string | null>(null);
  const state = featureBetaListState({ result, search, isLoading, isError });

  // A Retry that unmounts on success would drop keyboard focus to <body>.
  useEffect(() => {
    if (state === "error" || state === "loading" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    sectionRef.current?.focus({ preventScroll: true });
  }, [state]);

  // A removed row takes its focused trigger with it; land on the search, never on a refetch.
  useEffect(() => {
    const id = handOffId.current;
    if (!id || !result || result.items.some((u) => u.user_id === id)) return;
    handOffId.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    searchRef.current?.focus({ preventScroll: true });
  }, [result]);

  const clearSearch = () => {
    onSearchChange("");
    searchRef.current?.focus();
  };

  const page = result?.page ?? 1;
  const totalPages = result?.total_pages ?? 0;

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-slot="feature-beta-list"
      data-state={state}
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm outline-none",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            {FEATURE_BETA_LIST_COPY.title}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">
            {FEATURE_BETA_LIST_COPY.description[stage]}
          </p>
        </div>
        {action ? <div className="shrink-0 self-start">{action}</div> : null}
      </div>

      <div className="flex flex-col-reverse gap-2 px-5 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span
          aria-live="polite"
          data-slot="feature-beta-list-count"
          className="font-numeric text-xs text-muted-foreground"
        >
          {result && (state === "ready" || state === "page-empty")
            ? betaListCount(result.total)
            : null}
        </span>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            aria-label={FEATURE_BETA_LIST_COPY.searchLabel}
            placeholder={FEATURE_BETA_LIST_COPY.searchPlaceholder}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            data-slot="feature-beta-list-search"
            className="h-8 pl-8"
          />
        </div>
      </div>

      {state === "loading" ? (
        <div
          role="status"
          className="flex flex-col divide-y divide-border border-t"
        >
          <span className="sr-only">{FEATURE_BETA_LIST_COPY.loading}</span>
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              aria-hidden
              className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3.5"
            >
              <div className="flex w-48 flex-col gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : state === "error" ? (
        <div role="alert" className="px-4 pb-4">
          <EmptyState
            icon={CircleAlert}
            title={FEATURE_BETA_LIST_COPY.loadErrorTitle}
            description={
              <span data-slot="feature-beta-list-error">
                {errorMessage?.trim() || FEATURE_BETA_LIST_COPY.loadErrorBody}
              </span>
            }
            action={
              onRetry ? (
                <RetryButton
                  label={FEATURE_BETA_LIST_COPY.retry}
                  isRetrying={isRetrying}
                  onRetry={() => {
                    retried.current = true;
                    onRetry();
                  }}
                />
              ) : null
            }
          />
        </div>
      ) : state === "empty" ? (
        <div className="px-4 pb-4">
          <EmptyState
            icon={Users}
            title={FEATURE_BETA_LIST_COPY.emptyTitle}
            description={FEATURE_BETA_LIST_COPY.emptyBody}
          />
        </div>
      ) : state === "no-match" ? (
        <div className="px-4 pb-4">
          <EmptyState
            icon={SearchX}
            title={betaListNoMatchTitle(search)}
            description={FEATURE_BETA_LIST_COPY.noMatchBody}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSearch}
              >
                {FEATURE_BETA_LIST_COPY.clearSearch}
              </Button>
            }
          />
        </div>
      ) : state === "page-empty" ? (
        <div className="px-4 pb-4">
          <EmptyState
            icon={Users}
            title={FEATURE_BETA_LIST_COPY.pageEmptyTitle}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPageChange(Math.max(1, totalPages))}
              >
                {betaListGoToPage(Math.max(1, totalPages))}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* `relative`: the sr-only "Not recorded" spans would stretch the page (scroll-table trap). */}
          <div
            role="region"
            aria-labelledby={captionId}
            aria-busy={isRefreshing || undefined}
            data-slot="feature-beta-list-scroll"
            className={cn(
              "relative overflow-x-auto border-t transition-opacity duration-200",
              isRefreshing && "opacity-60",
            )}
          >
            <table data-slot="table" className="w-full text-sm">
              <caption id={captionId} className="sr-only">
                {FEATURE_BETA_LIST_COPY.tableLabel}
              </caption>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col" className={cn(HEAD, "pl-5")}>
                    {FEATURE_BETA_LIST_COPY.columns.username}
                  </TableHead>
                  <TableHead scope="col" className={cn(HEAD, FOLDED)}>
                    {FEATURE_BETA_LIST_COPY.columns.added}
                  </TableHead>
                  <TableHead scope="col" className={cn(HEAD, FOLDED)}>
                    {FEATURE_BETA_LIST_COPY.columns.addedBy}
                  </TableHead>
                  <TableHead
                    scope="col"
                    className={cn(HEAD, "pr-5 text-right")}
                  >
                    <span className="sr-only">
                      {FEATURE_BETA_LIST_COPY.columns.actions}
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result?.items.map((user) => (
                  <TableRow
                    key={user.user_id}
                    data-slot="feature-beta-user"
                    data-user-id={user.user_id}
                    data-username={user.username}
                    className="hover:bg-muted/30"
                  >
                    <TableHead
                      scope="row"
                      className={cn(
                        CELL,
                        "h-auto pl-5 font-normal whitespace-normal",
                      )}
                    >
                      <div className="max-w-xs min-w-40">
                        <span className="block font-medium break-words text-foreground">
                          {user.username}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                        {/* One text node: an exact date/username match never hits it in tests. */}
                        <span
                          data-slot="feature-beta-user-added-line"
                          className="mt-1 block text-xs text-foreground/80 lg:hidden"
                        >
                          {betaUserAddedLine(
                            user.added_at,
                            user.added_by?.username,
                          )}
                        </span>
                      </div>
                    </TableHead>
                    <TableCell
                      data-slot="feature-beta-user-added"
                      className={cn(CELL, FOLDED, "whitespace-nowrap")}
                    >
                      <time
                        dateTime={user.added_at}
                        className="font-numeric text-foreground"
                      >
                        {formatFeatureDate(user.added_at)}
                      </time>
                    </TableCell>
                    <TableCell
                      data-slot="feature-beta-user-added-by"
                      className={cn(CELL, FOLDED)}
                    >
                      <AddedBy
                        username={user.added_by?.username}
                        className="max-w-40"
                      />
                    </TableCell>
                    <TableCell className={cn(CELL, "py-2 pr-5 text-right")}>
                      <RemoveBetaUserButton
                        user={user}
                        featureName={featureName}
                        stage={stage}
                        onRemove={onRemove}
                        onArm={(armed) => {
                          handOffId.current = armed ? user.user_id : null;
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>

          {totalPages > 1 ? (
            <BetaListPager
              page={page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function BetaListPager({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  useFeatureCopyLocale();
  const atFirst = page <= 1;
  const atLast = page >= totalPages;

  return (
    <nav
      aria-label={FEATURE_BETA_LIST_COPY.pagerLabel}
      data-slot="feature-beta-list-pager"
      className="flex items-center justify-between gap-3 border-t px-5 py-3"
    >
      <span
        aria-live="polite"
        className="font-numeric text-xs text-muted-foreground"
      >
        {betaListPageLabel(page, totalPages)}
      </span>
      <div className="flex items-center gap-1">
        {/* aria-disabled at the ends: a focused button that turns `disabled` drops focus to <body>. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={FEATURE_BETA_LIST_COPY.previousPage}
          aria-disabled={atFirst || undefined}
          className="aria-disabled:opacity-40"
          onClick={() => {
            if (!atFirst) onPageChange(page - 1);
          }}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={FEATURE_BETA_LIST_COPY.nextPage}
          aria-disabled={atLast || undefined}
          className="aria-disabled:opacity-40"
          onClick={() => {
            if (!atLast) onPageChange(page + 1);
          }}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

function RemoveBetaUserButton({
  user,
  featureName,
  stage,
  onRemove,
  onArm,
}: {
  user: FeatureBetaUser;
  featureName: string;
  stage: FeatureStage;
  onRemove: (user: FeatureBetaUser) => Promise<string | void>;
  /** Armed before the DELETE: the row may leave with the refetch while the dialog is still open. */
  onArm: (armed: boolean) => void;
}) {
  useFeatureCopyLocale();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (value: boolean) => {
    if (pending) return;
    setOpen(value);
    if (value) setError(null);
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    onArm(true);
    let message: string | void;
    try {
      message = await onRemove(user);
    } catch {
      message = removeUserFailed(user.username);
    }
    setPending(false);
    if (message) {
      onArm(false);
      setError(message);
      return;
    }
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={removeUserLabel(user.username)}
          data-slot="feature-beta-user-remove"
        >
          <UserMinus aria-hidden data-icon="inline-start" />
          {FEATURE_BETA_LIST_COPY.remove}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-slot="feature-beta-user-remove-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {removeUserTitle(user.username)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {removeUserBody(user.username, featureName, stage)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <div
            role="alert"
            data-slot="feature-beta-user-error"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-pretty text-foreground"
          >
            <CircleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            <p className="min-w-0 break-words">{error}</p>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            aria-disabled={pending || undefined}
            className="aria-disabled:opacity-60"
          >
            {FEATURE_BETA_LIST_COPY.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            data-slot="feature-beta-user-remove-confirm"
            className="aria-disabled:opacity-60"
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {pending ? (
              <LoaderCircle
                aria-hidden
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : null}
            {FEATURE_BETA_LIST_COPY.remove}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
