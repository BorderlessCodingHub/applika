"use client";

import { useRef } from "react";
import {
  ClockIcon,
  FileTextIcon,
  FilePenLineIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import {
  DRAFTS_SECTION_COPY,
  NEW_WITH_CV_HREF,
  deleteDraftDescription,
  draftResumeHref,
  lastSavedLabel,
  lastSavedTitle,
} from "@/components/application-drafts/draft-copy";
import {
  APPLICATIONS_PAGE_COPY,
  applicationName,
} from "@/components/applications/application-card-copy";
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
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The fields of `DraftSummary` the section reads. */
export interface DraftsSectionItem {
  id: string;
  company_name: string;
  role: string;
  has_cv: boolean;
  created_at: string;
  /** `null` before the draft's first edit after creation (`TimeSchema`,
   * backend) — fall back to `created_at`, never render it raw. */
  updated_at: string | null;
}

export interface DraftsSectionProps {
  /** `GET /applications/drafts`, newest first. `undefined` while unknown. */
  drafts: readonly DraftsSectionItem[] | undefined;
  /** Renders nothing while loading: the section is absent until there is something to show. */
  isLoading?: boolean;
  /** A load error message; renders a compact error with Retry. */
  error?: string | null;
  onRetry?: () => void;
  /** Called once the user confirms. The dialog closes at once; pass `deletingId` meanwhile. */
  onDelete: (draft: DraftsSectionItem) => void;
  deletingId?: string | null;
  resumeHref?: (draft: DraftsSectionItem) => string;
  className?: string;
}

/**
 * The Drafts tab body on the applications page (KODI-036, AC2/AC8): company,
 * role, last saved, Resume and Delete. Since it IS the tab's whole content —
 * not a section floating alongside the applications list any more — it owns
 * no heading of its own (the tab trigger already says "Drafts"); the count
 * that used to sit beside that heading now rides the tab trigger instead
 * (`applications-page.tsx`). It stays visible with no drafts, including
 * right after the last one is deleted, and says so with a way to start one.
 */
export function DraftsSection({
  drafts,
  isLoading = false,
  error,
  onRetry,
  onDelete,
  deletingId,
  resumeHref = (draft) => draftResumeHref(draft.id),
  className,
}: DraftsSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (isLoading) return null;

  const items = drafts ?? [];

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      data-slot="drafts-section"
      className={cn("flex flex-col gap-4 outline-none", className)}
    >
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <p className="text-sm text-foreground">
            {DRAFTS_SECTION_COPY.loadError}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCcwIcon aria-hidden data-icon="inline-start" />
              {DRAFTS_SECTION_COPY.retry}
            </Button>
          ) : null}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary-muted text-primary">
            <FilePenLineIcon aria-hidden className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              {DRAFTS_SECTION_COPY.emptyTitle}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {DRAFTS_SECTION_COPY.description}
            </p>
          </div>
          <LinkButton href={NEW_WITH_CV_HREF} variant="outline">
            {APPLICATIONS_PAGE_COPY.newWithCv}
          </LinkButton>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {items.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              href={resumeHref(draft)}
              deleting={deletingId === draft.id}
              onDelete={onDelete}
              onDeleted={() => containerRef.current?.focus()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftRow({
  draft,
  href,
  deleting,
  onDelete,
  onDeleted,
}: {
  draft: DraftsSectionItem;
  href: string;
  deleting: boolean;
  onDelete: (draft: DraftsSectionItem) => void;
  onDeleted: () => void;
}) {
  const confirmed = useRef(false);
  const name = applicationName(draft.role, draft.company_name);
  // A draft that has never been edited past its creating POST comes back
  // with `updated_at: null` (`TimeSchema`, backend) — `created_at` is the
  // last time it was actually saved. Never render the `null` verbatim: `new
  // Date(null)` is 1 Jan 1970, not NaN, which used to read "Saved 56 years
  // ago" (frontend-qa KODI-036 round 1, B2).
  const lastSavedAt = draft.updated_at ?? draft.created_at;

  return (
    <li
      data-draft-id={draft.id}
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-foreground">
          {draft.company_name}
        </p>
        <p className="truncate text-sm text-muted-foreground">{draft.role}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClockIcon aria-hidden className="size-3.5 shrink-0" />
          <time dateTime={lastSavedAt} title={lastSavedTitle(lastSavedAt)}>
            {lastSavedLabel(lastSavedAt)}
          </time>
        </p>
        {draft.has_cv ? (
          <Badge variant="secondary">
            <FileTextIcon aria-hidden />
            {DRAFTS_SECTION_COPY.cvCopy}
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <LinkButton
            href={href}
            variant="outline"
            size="sm"
            aria-disabled={deleting || undefined}
            tabIndex={deleting ? -1 : undefined}
            className={cn(deleting && "pointer-events-none opacity-50")}
          >
            {DRAFTS_SECTION_COPY.resume}
            <span className="sr-only"> {name}</span>
          </LinkButton>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete draft ${name}`}
                aria-disabled={deleting || undefined}
                onClick={(event) => {
                  if (deleting) event.preventDefault();
                }}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                {deleting ? (
                  <LoaderCircleIcon
                    aria-hidden
                    className="motion-safe:animate-spin"
                  />
                ) : (
                  <Trash2Icon aria-hidden />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                // The row is about to go; focus the section heading, not a trigger that unmounts.
                if (!confirmed.current) return;
                confirmed.current = false;
                event.preventDefault();
                onDeleted();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {DRAFTS_SECTION_COPY.deleteTitle}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteDraftDescription(draft.role, draft.company_name)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {DRAFTS_SECTION_COPY.cancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    confirmed.current = true;
                    onDelete(draft);
                  }}
                >
                  {DRAFTS_SECTION_COPY.deleteConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </li>
  );
}
