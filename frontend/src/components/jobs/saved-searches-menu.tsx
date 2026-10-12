"use client";

import { useId, useRef, useState, type RefObject } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BookmarkIcon,
  BookmarkPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  JOBS_COPY,
  deleteSearchDescription,
  deleteSearchLabel,
  renameSearchDescription,
  renameSearchLabel,
  savedCapLabel,
  savedCountLabel,
  summarizeJobFilters,
} from "@/components/jobs/job-copy";
import {
  JOB_SEARCHES_MAX,
  JOB_SEARCH_NAME_MAX,
  type JobSearch,
} from "@/services/types/job-searches";

/** Resolve with nothing to close the dialog, or with the server's `detail` (a 409) to show it inline. */
export type SavedSearchOutcome = string | null | undefined | void;

const GENERIC_ERROR = "Something went wrong. Try again.";

export const savedSearchNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, JOBS_COPY.nameRequired)
    .max(JOB_SEARCH_NAME_MAX, JOBS_COPY.nameTooLong),
});

type NameValues = z.infer<typeof savedSearchNameSchema>;

export interface SavedSearchesMenuProps {
  searches: readonly JobSearch[] | undefined;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** The saved search whose filters equal the current ones: marked with a check and `aria-current`. */
  activeId?: string | null;
  onApply: (search: JobSearch) => void;
  /** Saves the CURRENT filters under `name`. */
  onSave: (name: string) => Promise<SavedSearchOutcome>;
  onRename: (search: JobSearch, name: string) => Promise<SavedSearchOutcome>;
  onDelete: (search: JobSearch) => Promise<SavedSearchOutcome>;
  max?: number;
  className?: string;
}

type DialogState =
  | { kind: "save"; open: boolean }
  | { kind: "rename"; open: boolean; search: JobSearch }
  | { kind: "delete"; open: boolean; search: JobSearch };

/**
 * R-031/R-032: list, apply, save, rename and delete saved searches, up to
 * `max`. A popover with plain buttons per row (a menu may not hold nested
 * buttons). No notification control, by design.
 */
export function SavedSearchesMenu({
  searches,
  isLoading = false,
  error,
  onRetry,
  activeId,
  onApply,
  onSave,
  onRename,
  onDelete,
  max = JOB_SEARCHES_MAX,
  className,
}: SavedSearchesMenuProps) {
  const headingId = useId();
  const capId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handoff = useRef(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const items = searches ?? [];
  const atCap = items.length >= max;

  function openDialog(next: DialogState) {
    handoff.current = true;
    setPopoverOpen(false);
    setDialog(next);
  }

  function closeDialog() {
    setDialog((current) => (current ? { ...current, open: false } : current));
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            data-slot="saved-searches-trigger"
            className={className}
          >
            <BookmarkIcon aria-hidden data-icon="inline-start" />
            {JOBS_COPY.savedSearches}
            {items.length > 0 ? (
              <Badge
                aria-hidden
                variant="secondary"
                className="font-numeric font-normal"
              >
                {items.length}
              </Badge>
            ) : null}
            <ChevronDownIcon
              aria-hidden
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          data-slot="saved-searches-menu"
          className="flex w-[min(22rem,calc(100vw-2rem))] flex-col p-0"
          onCloseAutoFocus={(event) => {
            // Focus goes to the dialog that replaces the popover, not back to the trigger.
            if (!handoff.current) return;
            handoff.current = false;
            event.preventDefault();
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <p
              id={headingId}
              className="font-display text-sm font-semibold text-foreground"
            >
              {JOBS_COPY.savedSearches}
            </p>
            {searches ? (
              <span className="font-numeric text-xs text-muted-foreground">
                {savedCountLabel(items.length, max)}
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <div aria-hidden className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 px-4 py-3"
            >
              <p className="text-sm text-foreground/80">
                {JOBS_COPY.savedLoadError} {error}
              </p>
              {onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                >
                  <RotateCcwIcon aria-hidden data-icon="inline-start" />
                  {JOBS_COPY.retry}
                </Button>
              ) : null}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-foreground">
                {JOBS_COPY.savedEmptyTitle}
              </p>
              <p className="mt-1 text-xs text-pretty text-muted-foreground">
                {JOBS_COPY.savedEmptyBody}
              </p>
            </div>
          ) : (
            <ul
              aria-labelledby={headingId}
              className="flex max-h-72 flex-col gap-0.5 overflow-y-auto p-1.5"
            >
              {items.map((search) => (
                <SavedSearchRow
                  key={search.id}
                  search={search}
                  active={search.id === activeId}
                  onApply={() => {
                    setPopoverOpen(false);
                    onApply(search);
                  }}
                  onRename={() =>
                    openDialog({ kind: "rename", open: true, search })
                  }
                  onDelete={() =>
                    openDialog({ kind: "delete", open: true, search })
                  }
                />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1 border-t p-1.5">
            <Button
              type="button"
              variant="ghost"
              disabled={atCap}
              aria-describedby={atCap ? capId : undefined}
              onClick={() => openDialog({ kind: "save", open: true })}
              className="w-full justify-start"
            >
              <BookmarkPlusIcon aria-hidden data-icon="inline-start" />
              {JOBS_COPY.saveCurrent}
            </Button>
            {atCap ? (
              <p
                id={capId}
                data-slot="saved-searches-cap"
                className="px-2.5 pb-1.5 text-xs text-muted-foreground"
              >
                {savedCapLabel(max)}
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <SavedSearchNameDialog
        open={dialog?.open === true && dialog.kind !== "delete"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        mode={dialog?.kind === "rename" ? "rename" : "save"}
        defaultName={dialog?.kind === "rename" ? dialog.search.name : ""}
        onSubmit={(name) =>
          dialog?.kind === "rename"
            ? onRename(dialog.search, name)
            : onSave(name)
        }
        returnFocusRef={triggerRef}
      />

      <SavedSearchDeleteDialog
        open={dialog?.open === true && dialog.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        name={dialog?.kind === "delete" ? dialog.search.name : ""}
        onConfirm={() =>
          dialog?.kind === "delete" ? onDelete(dialog.search) : undefined
        }
        returnFocusRef={triggerRef}
      />
    </>
  );
}

function SavedSearchRow({
  search,
  active,
  onApply,
  onRename,
  onDelete,
}: {
  search: JobSearch;
  active: boolean;
  onApply: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const summaryId = useId();

  return (
    <li
      data-saved-search-id={search.id}
      className="flex items-center gap-0.5 rounded-md transition-colors hover:bg-accent/60"
    >
      <Button
        type="button"
        variant="ghost"
        aria-label={search.name}
        aria-describedby={summaryId}
        aria-current={active ? "true" : undefined}
        onClick={onApply}
        className="h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left whitespace-normal hover:bg-transparent dark:hover:bg-transparent"
      >
        <span className="flex w-full min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          {active ? (
            <CheckIcon aria-hidden className="size-3.5 shrink-0 text-primary" />
          ) : null}
          <span className="truncate">{search.name}</span>
        </span>
        <span
          id={summaryId}
          className="w-full truncate text-xs font-normal text-foreground/70"
        >
          {summarizeJobFilters(search.filters)}
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={renameSearchLabel(search.name)}
        onClick={onRename}
        className="text-muted-foreground hover:text-foreground"
      >
        <PencilIcon aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={deleteSearchLabel(search.name)}
        onClick={onDelete}
        className="mr-0.5 text-muted-foreground hover:text-foreground"
      >
        <Trash2Icon aria-hidden />
      </Button>
    </li>
  );
}

function returnFocus(
  ref: RefObject<HTMLElement | null>,
  event: { preventDefault: () => void },
) {
  const target = ref.current;
  if (!target?.isConnected) return;
  event.preventDefault();
  target.focus();
}

function SavedSearchNameDialog({
  open,
  onOpenChange,
  mode,
  defaultName,
  onSubmit,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "save" | "rename";
  defaultName: string;
  onSubmit: (name: string) => Promise<SavedSearchOutcome>;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A late 409 must land in an open dialog (Escape/overlay wait).
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-slot="saved-search-name-dialog"
        data-mode={mode}
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => returnFocus(returnFocusRef, event)}
      >
        <DialogHeader>
          <DialogTitle className="font-display">
            {mode === "rename" ? JOBS_COPY.renameTitle : JOBS_COPY.saveCurrent}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {mode === "rename"
              ? renameSearchDescription(defaultName)
              : JOBS_COPY.saveDialogDescription}
          </DialogDescription>
        </DialogHeader>
        <NameForm
          defaultName={defaultName}
          submitLabel={
            mode === "rename" ? JOBS_COPY.renameSubmit : JOBS_COPY.saveSubmit
          }
          onSubmit={onSubmit}
          onPendingChange={setPending}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted per open (inside DialogContent), so every open starts from `defaultName`. */
function NameForm({
  defaultName,
  submitLabel,
  onSubmit,
  onPendingChange,
  onDone,
}: {
  defaultName: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<SavedSearchOutcome>;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}) {
  const form = useForm<NameValues>({
    resolver: zodResolver(savedSearchNameSchema),
    defaultValues: { name: defaultName },
  });
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(values: NameValues) {
    if (pending) return;
    setPending(true);
    onPendingChange(true);
    setServerError(null);
    try {
      const outcome = await onSubmit(values.name);
      if (typeof outcome === "string" && outcome) setServerError(outcome);
      else onDone();
    } catch {
      setServerError(GENERIC_ERROR);
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  }

  return (
    <Form {...form}>
      <form
        noValidate
        data-slot="saved-search-name-form"
        onSubmit={form.handleSubmit(submit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{JOBS_COPY.nameLabel}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  maxLength={JOB_SEARCH_NAME_MAX}
                  onChange={(event) => {
                    field.onChange(event);
                    if (serverError) setServerError(null);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError ? <InlineError message={serverError} /> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) onDone();
            }}
          >
            {JOBS_COPY.cancel}
          </Button>
          <Button
            type="submit"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className="aria-disabled:opacity-60"
          >
            {pending ? (
              <LoaderCircleIcon
                aria-hidden
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function SavedSearchDeleteDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onConfirm: () => Promise<SavedSearchOutcome> | undefined;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        data-slot="saved-search-delete-dialog"
        onCloseAutoFocus={(event) => returnFocus(returnFocusRef, event)}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{JOBS_COPY.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteSearchDescription(name)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DeleteActions
          onConfirm={onConfirm}
          onPendingChange={setPending}
          onDone={() => onOpenChange(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteActions({
  onConfirm,
  onPendingChange,
  onDone,
}: {
  onConfirm: () => Promise<SavedSearchOutcome> | undefined;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    setPending(true);
    onPendingChange(true);
    setServerError(null);
    try {
      const outcome = await onConfirm();
      if (typeof outcome === "string" && outcome) setServerError(outcome);
      else onDone();
    } catch {
      setServerError(GENERIC_ERROR);
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  }

  return (
    <>
      {serverError ? <InlineError message={serverError} /> : null}
      <AlertDialogFooter>
        <AlertDialogCancel
          aria-disabled={pending || undefined}
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {JOBS_COPY.cancel}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          onClick={(event) => {
            // Stay open until the server answers; an error shows above.
            event.preventDefault();
            void confirm();
          }}
          className="aria-disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircleIcon
              aria-hidden
              data-icon="inline-start"
              className="motion-safe:animate-spin"
            />
          ) : null}
          {JOBS_COPY.deleteConfirm}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      data-slot="saved-search-error"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground"
    >
      <CircleAlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      {message}
    </p>
  );
}
