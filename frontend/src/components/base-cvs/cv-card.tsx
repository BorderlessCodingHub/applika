"use client";

import { Check, FileText, Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Card } from "@/components/ui/card";
import { ExportCvButton } from "@/components/base-cvs/export-cv-button";
import { skillKeywords, type BaseCv } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

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

/** Makes the tile one option of a radio group. See `CvCardProps.selection`. */
export interface CvCardSelection {
  /** The `name` every tile of the group shares. */
  name: string;
  checked: boolean;
  onSelect: () => void;
  /** Id of the text that says what choosing does. */
  describedBy?: string;
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
  /** Asks the server for this CV's Markdown (KODI-017 part 3), beside the PDF. */
  onExportMarkdown?: () => void;
  /** Reflects an in-flight Markdown render on this card. */
  isExportingMarkdown?: boolean;
  /**
   * Turns the tile into a radio option: a radio before the name, the name its
   * label, the whole tile its click target, the actions still on top. Absent
   * on `/cvs`, where the tile renders exactly as it did before.
   */
  selection?: CvCardSelection;
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
  onExportMarkdown,
  isExportingMarkdown = false,
  selection,
  className,
}: CvCardProps) {
  // Every keyword of every category, flattened, deduplicated, uncapped. The
  // owner asked to see what is IN the CV, and a hidden "+7" is the thing they
  // asked us to stop doing.
  const keywords = skillKeywords(cv.skills);
  const updated = formatUpdated(cv.updated_at);

  return (
    <Card
      className={cn(
        "min-h-52 gap-0 py-0 transition-colors hover:border-primary/40",
        selection &&
          "relative has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
        selection?.checked &&
          "border-primary ring-1 ring-primary hover:border-primary",
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

        <h3
          className={cn(
            "mt-4 font-display text-sm font-semibold",
            selection ? "min-w-0" : "truncate",
          )}
        >
          {selection ? (
            // The name is the radio's label, so the accessible name is exactly
            // the visible one. `before:inset-0` stretches the label over the
            // tile; the `relative` radio, name and action row paint above it.
            <label className="flex min-w-0 cursor-pointer items-center gap-2 before:absolute before:inset-0 before:rounded-xl has-[input:disabled]:cursor-not-allowed">
              <span className="relative flex size-4 shrink-0">
                <input
                  type="radio"
                  name={selection.name}
                  value={cv.id}
                  checked={selection.checked}
                  onChange={selection.onSelect}
                  disabled={isDeleting}
                  aria-describedby={selection.describedBy}
                  className="peer size-4 cursor-pointer appearance-none rounded-full border border-muted-foreground transition-colors outline-none checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
                <Check
                  aria-hidden
                  strokeWidth={3}
                  className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
                />
              </span>
              <span className="relative truncate">{cv.name}</span>
            </label>
          ) : (
            cv.name
          )}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {cv.full_name}
          {cv.headline ? ` · ${cv.headline}` : ""}
        </p>

        <div className="mt-4 min-h-8">
          {keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {keywords.map((keyword) => (
                // `max-w-full whitespace-normal` beats the registry Badge's
                // `whitespace-nowrap`: a keyword may be 100 characters
                // (`BASE_CV_MAX.skillKeyword`), which is wider than the tile,
                // and the shell column is `overflow-hidden` — so without this
                // the tail is CLIPPED with no way to reveal it, which is the
                // silent truncation this card exists to stop. It wraps
                // instead. Realistic keywords are untouched.
                <Badge
                  key={keyword}
                  variant="secondary"
                  className="max-w-full rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-normal"
                >
                  {keyword}
                </Badge>
              ))}
            </div>
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
            `${keywords.length} ${keywords.length === 1 ? "keyword" : "keywords"}`,
          ].join(" \u00b7 ")}
        </p>

        {/*
          `flex-wrap`: three controls no longer fit one 320px row. Least
          destructive first, destructive last — download, edit, delete.
        */}
        <div
          className={cn(
            "mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4",
            selection && "relative",
          )}
        >
          {onExport ? (
            <ExportCvButton
              layout="compact"
              variant="ghost"
              cvName={cv.name}
              isExporting={isExporting}
              onExport={onExport}
              onExportMarkdown={onExportMarkdown}
              isExportingMarkdown={isExportingMarkdown}
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
