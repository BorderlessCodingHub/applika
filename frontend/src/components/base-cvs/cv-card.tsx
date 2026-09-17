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
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { skillCategoryNames, type BaseCv } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_SKILLS = 5;

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
  className,
}: CvCardProps) {
  // The card shows the CATEGORY names; the keywords inside them belong to the
  // document, not to a summary chip row.
  const categories = skillCategoryNames(cv.skills);
  const visibleSkills = categories.slice(0, MAX_VISIBLE_SKILLS);
  const overflow = categories.length - visibleSkills.length;
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

        <div className="mt-4 min-h-8">
          {visibleSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {visibleSkills.map((skill) => (
                <Badge
                  key={skill}
                  variant="secondary"
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                >
                  {skill}
                </Badge>
              ))}
              {overflow > 0 ? (
                <span className="self-center text-[10px] text-muted-foreground">
                  {`+${overflow}`}
                </span>
              ) : null}
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
          ].join(" \u00b7 ")}
        </p>

        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-4">
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
