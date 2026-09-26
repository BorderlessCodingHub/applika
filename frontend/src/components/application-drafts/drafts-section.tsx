"use client";

import { useId, useRef } from "react";
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
  deleteDraftDescription,
  draftResumeHref,
  lastSavedLabel,
  lastSavedTitle,
} from "@/components/application-drafts/draft-copy";
import { applicationName } from "@/components/applications/application-card-copy";
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
  updated_at: string;
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
 * The applications page's Drafts: company, role, last saved, Resume and Delete.
 * Absent (`null`) while loading and when the user has no drafts.
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
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (isLoading) return null;
  if (!error && (!drafts || drafts.length === 0)) return null;

  const items = drafts ?? [];

  return (
    <section
      aria-labelledby={headingId}
      data-slot="drafts-section"
      className={cn(
        "rounded-xl border border-dashed border-border-strong bg-surface/60",
        className,
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
          <FilePenLineIcon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-base font-semibold text-foreground outline-none"
            >
              {DRAFTS_SECTION_COPY.title}
            </h2>
            {items.length > 0 ? (
              <Badge aria-hidden variant="secondary" className="font-numeric">
                {items.length}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {DRAFTS_SECTION_COPY.description}
          </p>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 sm:px-5"
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
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              href={resumeHref(draft)}
              deleting={deletingId === draft.id}
              onDelete={onDelete}
              onDeleted={() => headingRef.current?.focus()}
            />
          ))}
        </ul>
      )}
    </section>
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
          <time
            dateTime={draft.updated_at}
            title={lastSavedTitle(draft.updated_at)}
          >
            {lastSavedLabel(draft.updated_at)}
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
