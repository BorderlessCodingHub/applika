"use client";

import { useId, useState } from "react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Plus,
  Search,
  SearchX,
  UserPlus,
} from "lucide-react";

import {
  FEATURE_ADD_USER_COPY,
  addUserDescription,
  addUserFailed,
  addUserLabel,
  addUserMore,
  addUserNoMatch,
  addedUserStatus,
  listedUserLabel,
  type FeatureUserCandidate,
  useFeatureCopyLocale,
} from "@/components/admin/feature-copy";
import { RetryButton } from "@/components/admin/feature-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AddUserResultsState =
  | "idle"
  | "loading"
  | "error"
  | "empty"
  | "ready";

export function addUserResultsState({
  users,
  search,
  isLoading,
  isError,
}: {
  users: readonly FeatureUserCandidate[] | undefined;
  search: string;
  isLoading?: boolean;
  isError?: boolean;
}): AddUserResultsState {
  if (isLoading) return "loading";
  if (users) {
    if (users.length > 0) return "ready";
    return search.trim() ? "empty" : "idle";
  }
  if (isError) return "error";
  return search.trim() ? "loading" : "idle";
}

export interface FeatureAddUserDialogProps {
  featureName: string;
  /** The input's value; debounce the request, not this. Cleared (`""`) when the dialog closes. */
  search: string;
  onSearchChange: (search: string) => void;
  /** `GET /admin/users?search=` items; `undefined` before the first answer. */
  users: readonly FeatureUserCandidate[] | undefined;
  /** The search's `total`; above `users.length` a "Showing n of total" note appears. */
  total?: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** A refetch with the last results still on screen: dims them. */
  isRefreshing?: boolean;
  /** Users already on the beta list: their row reads "On the list" instead of "Add". */
  listedUserIds?: readonly string[];
  /**
   * `PUT /admin/features/{key}/users/{id}` (idempotent). Resolve with nothing
   * when added; resolve with a message (the server's `detail`, verbatim) to
   * show it. A rejection shows a generic message.
   */
  onAdd: (user: FeatureUserCandidate) => Promise<string | void>;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** AC3: "Add user" and its dialog: search every user by username or email, add per row. */
export function FeatureAddUserDialog({
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
  className,
}: FeatureAddUserDialogProps) {
  useFeatureCopyLocale();
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const [addedIds, setAddedIds] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = addUserResultsState({ users, search, isLoading, isError });

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          data-slot="feature-add-user"
          className={className}
        >
          <UserPlus aria-hidden data-icon="inline-start" />
          {FEATURE_ADD_USER_COPY.trigger}
        </Button>
      </DialogTrigger>
      {/* Timeline shape: top-anchored, header/footer bands, only the results scroll. */}
      <DialogContent
        data-slot="feature-add-user-dialog"
        className="top-4 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 p-0 sm:top-[8dvh] sm:max-h-[84dvh]"
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{FEATURE_ADD_USER_COPY.title}</DialogTitle>
          <DialogDescription>
            {addUserDescription(featureName)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-6 pb-4">
          <Label htmlFor={searchId}>{FEATURE_ADD_USER_COPY.searchLabel}</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              placeholder={FEATURE_ADD_USER_COPY.searchPlaceholder}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              value={search}
              onChange={(event) => {
                setError(null);
                onSearchChange(event.target.value);
              }}
              data-slot="feature-add-user-search"
              className="pl-8"
            />
          </div>
        </div>

        <div
          data-slot="feature-add-user-results"
          data-state={state}
          aria-busy={isRefreshing || undefined}
          className={cn(
            "min-h-28 flex-1 overflow-y-auto overscroll-contain border-t transition-opacity duration-200",
            isRefreshing && "opacity-60",
          )}
        >
          {state === "idle" ? (
            <p className="px-6 py-8 text-center text-sm text-pretty text-muted-foreground">
              {FEATURE_ADD_USER_COPY.idle}
            </p>
          ) : state === "loading" ? (
            <div role="status" className="flex flex-col divide-y divide-border">
              <span className="sr-only">{FEATURE_ADD_USER_COPY.loading}</span>
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  aria-hidden
                  className="flex items-center justify-between gap-4 px-6 py-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : state === "error" ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-3 px-6 py-8 text-center"
            >
              <p className="flex items-center gap-2 text-sm text-foreground">
                <CircleAlert
                  aria-hidden
                  className="size-4 shrink-0 text-destructive"
                />
                {FEATURE_ADD_USER_COPY.errorTitle}
              </p>
              {onRetry ? (
                <RetryButton
                  label={FEATURE_ADD_USER_COPY.retry}
                  isRetrying={isRetrying}
                  onRetry={onRetry}
                />
              ) : null}
            </div>
          ) : state === "empty" ? (
            <p className="flex items-center justify-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
              <SearchX aria-hidden className="size-4 shrink-0" />
              <span>{addUserNoMatch(search)}</span>
            </p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-border">
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
                <p className="border-t px-6 py-3 text-xs text-muted-foreground">
                  {addUserMore(users.length, total)}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t px-6 py-4">
          {/* Always mounted (never display:none), so the first "added" is announced. */}
          <div
            aria-live="polite"
            aria-atomic="true"
            data-slot="feature-add-user-status"
          >
            {status ? (
              <p className="mb-3 flex items-start gap-2 text-sm text-foreground">
                <CircleCheck
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-success"
                />
                <span className="min-w-0 break-words">{status}</span>
              </p>
            ) : null}
          </div>
          {error ? (
            <div
              role="alert"
              data-slot="feature-add-user-error"
              className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-pretty text-foreground"
            >
              <CircleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
              <p className="min-w-0 break-words">{error}</p>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {FEATURE_ADD_USER_COPY.done}
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
      className="flex items-center justify-between gap-4 px-6 py-3"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {user.username}
          </span>
          {user.is_admin ? (
            <Badge
              variant="outline"
              className="h-5 rounded-full border-warning/50 px-1.5 text-[11px] text-foreground"
            >
              {FEATURE_ADD_USER_COPY.admin}
            </Badge>
          ) : null}
        </div>
        <span className="block truncate text-xs text-foreground/70">
          {user.email}
        </span>
      </div>
      {/* One element through Add → pending → On the list, so focus never leaves it. */}
      <Button
        type="button"
        variant={listed ? "ghost" : "outline"}
        size="sm"
        aria-label={
          listed ? listedUserLabel(user.username) : addUserLabel(user.username)
        }
        aria-disabled={busy || undefined}
        aria-busy={pending || undefined}
        data-slot="feature-add-user-action"
        data-listed={listed}
        className={cn(
          "shrink-0",
          pending && "aria-disabled:opacity-60",
          listed &&
            "aria-disabled:cursor-default aria-disabled:hover:bg-transparent",
        )}
        onClick={() => {
          if (!busy) onAdd();
        }}
      >
        {listed ? (
          <Check
            aria-hidden
            data-icon="inline-start"
            className="text-success"
          />
        ) : pending ? (
          <LoaderCircle
            aria-hidden
            data-icon="inline-start"
            className="motion-safe:animate-spin"
          />
        ) : (
          <Plus aria-hidden data-icon="inline-start" />
        )}
        {listed ? FEATURE_ADD_USER_COPY.listed : FEATURE_ADD_USER_COPY.add}
      </Button>
    </li>
  );
}
