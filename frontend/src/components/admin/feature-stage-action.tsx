"use client";

import { useState } from "react";
import { CircleAlert, LoaderCircle, Rocket, Undo2 } from "lucide-react";

import {
  FEATURE_STAGE_COPY,
  moveBackTitle,
  releaseBody,
  releaseTitle,
} from "@/components/admin/feature-copy";
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
import type { FeatureStage } from "@/services/types/features";

export interface FeatureStageActionProps {
  stage: FeatureStage;
  featureName: string;
  /**
   * `PATCH /admin/features/{key}` with `{stage: next}`. Resolve with nothing
   * to close; resolve with a message (the server's `detail`, verbatim) to keep
   * the dialog open and show it. A rejection shows a generic message.
   */
  onConfirm: (next: FeatureStage) => Promise<string | void>;
  className?: string;
}

/** AC5: beta → "Release to everyone", general → "Move back to beta", each behind an AlertDialog. Cancel sends nothing. */
export function FeatureStageAction({
  stage,
  featureName,
  onConfirm,
  className,
}: FeatureStageActionProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Frozen on open: the refetch after a confirm flips `stage` while the dialog fades out.
  const [dialogStage, setDialogStage] = useState<FeatureStage>(stage);
  const releasing = stage === "beta";
  const dialogReleasing = dialogStage === "beta";
  const next: FeatureStage = dialogReleasing ? "general" : "beta";
  const body = dialogReleasing
    ? releaseBody(featureName)
    : ([
        FEATURE_STAGE_COPY.moveBack.loseAccess,
        FEATURE_STAGE_COPY.moveBack.keepList,
      ] as const);

  const handleOpenChange = (value: boolean) => {
    if (pending) return;
    setOpen(value);
    if (value) {
      setError(null);
      setDialogStage(stage);
    }
  };

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
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={releasing ? "default" : "outline"}
          size="sm"
          data-slot="feature-stage-action"
          data-next-stage={releasing ? "general" : "beta"}
          className={className}
        >
          {releasing ? (
            <Rocket aria-hidden data-icon="inline-start" />
          ) : (
            <Undo2 aria-hidden data-icon="inline-start" />
          )}
          {releasing
            ? FEATURE_STAGE_COPY.release.action
            : FEATURE_STAGE_COPY.moveBack.action}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        data-slot="feature-stage-dialog"
        data-next-stage={next}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {dialogReleasing
              ? releaseTitle(featureName)
              : moveBackTitle(featureName)}
          </AlertDialogTitle>
          {/* One <p> per sentence, so each can be asserted whole. */}
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              {body.map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <div
            role="alert"
            data-slot="feature-stage-error"
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
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            {FEATURE_STAGE_COPY.cancel}
          </AlertDialogCancel>
          {/* Pending keeps focus: aria-disabled, not disabled (KODI-048). */}
          <AlertDialogAction
            variant={dialogReleasing ? "default" : "destructive"}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            data-slot="feature-stage-confirm"
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
            {dialogReleasing
              ? FEATURE_STAGE_COPY.release.confirm
              : FEATURE_STAGE_COPY.moveBack.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
