"use client";

import { FileText, Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExportCvButton } from "@/components/base-cvs/export-cv-button";
import {
  skillCategoryKeywords,
  skillKeywordCount,
  type BaseCv,
} from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/**
 * Between two keywords of one category. The middle dot the typeset document
 * uses, because the card is showing the same run of words — but the card is
 * NOT one of the renderers the parity table pins, so it keeps its own copy
 * rather than importing the document's constant.
 */
const KEYWORD_SEPARATOR = " \u00b7 ";

function formatUpdated(value: string | null): string | null {
  // `new Date(null)` is the epoch, not an invalid date, so a CV that has never
  // been updated would otherwise claim it was updated in 1970.
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export interface CvCardProps {
  cv: BaseCv;
  /** Destination of the edit action. */
  href: string;
  /** Called once the user confirms the deletion. */
  onDelete: () => void;
  /** Reflects an in-flight delete on this card. */
  isDeleting?: boolean;
  /**
   * Asks the server for this CV's PDF. The parent owns the request and the
   * errors. Without it the tile renders no download at all — the gallery
   * always passes it.
   */
  onExport?: () => void;
  /** Reflects an in-flight PDF render on this card. */
  isExporting?: boolean;
  className?: string;
}

/**
 * Gallery tile for one master CV: its label, who it is for, a hint of what is
 * in it, and the edit and delete affordances. Presentation only — the parent
 * owns navigation and the delete mutation.
 */
export function CvCard({
  cv,
  href,
  onDelete,
  isDeleting = false,
  onExport,
  isExporting = false,
  className,
}: CvCardProps) {
  // Every keyword of every category, uncapped. The owner asked to see what is
  // IN the CV, and a hidden "+7" is the thing they asked us to stop doing.
  const categories = skillCategoryKeywords(cv.skills);
  const keywordCount = skillKeywordCount(cv.skills);
  const updated = formatUpdated(cv.updated_at);

  return (
    <Card
      className={cn(
        "min-h-52 gap-0 py-0 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20">
            <FileText aria-hidden className="size-4 text-primary" />
          </span>
          {updated ? (
            <span className="text-right text-[11px] text-muted-foreground">
              {`Updated ${updated}`}
            </span>
          ) : null}
        </div>

        <h3 className="mt-4 truncate font-display text-sm font-semibold">
          {cv.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {cv.full_name}
          {cv.headline ? ` · ${cv.headline}` : ""}
        </p>

        {/*
          A chip per keyword would be four times the height of the same words
          set as text, and a tile has to stay a tile. So the card prints the
          skills the way the CV prints them: the category, then its keywords
          joined by a middle dot. Nothing is clipped and nothing is counted
          away — a `line-clamp` here would be exactly the silent truncation
          this card is being fixed to remove.
        */}
        <div className="mt-4 min-h-8">
          {categories.length > 0 ? (
            <dl className="space-y-1">
              {categories.map((entry) => (
                <div key={entry.id} className="text-[11px] leading-snug">
                  <dt className="inline font-medium text-foreground">
                    {entry.category}
                  </dt>
                  {entry.keywords.length > 0 ? (
                    <dd className="inline text-muted-foreground">
                      {`: ${entry.keywords.join(KEYWORD_SEPARATOR)}`}
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground/70">
              No skills added yet
            </p>
          )}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {[
            `${cv.experience.length} ${cv.experience.length === 1 ? "role" : "roles"}`,
            `${cv.projects.length} ${cv.projects.length === 1 ? "project" : "projects"}`,
            `${cv.languages.length} ${cv.languages.length === 1 ? "language" : "languages"}`,
            `${keywordCount} ${keywordCount === 1 ? "keyword" : "keywords"}`,
          ].join(" \u00b7 ")}
        </p>

        {/*
          `flex-wrap`: three controls no longer fit one 320px row. Least
          destructive first, destructive last — download, edit, delete.
        */}
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {onExport ? (
            <ExportCvButton
              layout="compact"
              variant="ghost"
              cvName={cv.name}
              isExporting={isExporting}
              onExport={onExport}
            />
          ) : null}

          <LinkButton
            href={href}
            variant="outline"
            size="sm"
            aria-label={`Edit ${cv.name}`}
          >
            <Pencil aria-hidden />
            Edit
          </LinkButton>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                aria-label={`Delete ${cv.name}`}
                className="text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
              >
                {isDeleting ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden />
                )}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this master CV?</AlertDialogTitle>
                <AlertDialogDescription>
                  {`"${cv.name}" and everything in it is removed for good. This cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}
