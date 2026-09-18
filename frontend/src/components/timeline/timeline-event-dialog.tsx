"use client";

import { type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TimelineEventDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Controlled open-change handler. */
  onOpenChange: (open: boolean) => void;
  /** `create` = "Add event"; `edit` = "Edit event". */
  mode: "create" | "edit";
  /** Overrides the default title. */
  title?: ReactNode;
  /** Overrides the default description. */
  description?: ReactNode;
  /**
   * The form body — put your `<Form>` + `TimelineEventFormFields` here. Give the
   * inner `<form>` an `id` and point the footer submit button at it via
   * `form="…"` so the action can live in `footer`.
   */
  children: ReactNode;
  /** Footer actions, typically Cancel + a submit `<Button type="submit" form=…>`. */
  footer: ReactNode;
}

const DEFAULTS: Record<
  TimelineEventDialogProps["mode"],
  { title: string; description: string }
> = {
  create: {
    title: "Add event",
    description:
      "Record a note, interview, feedback, offer, or rejection for this application.",
  },
  edit: {
    title: "Edit event",
    description: "Update the details of this timeline event.",
  },
};

/**
 * Accessible dialog shell for the add/edit timeline-event form. Radix `Dialog`
 * traps focus, restores it to the trigger on close, and dismisses on
 * Escape/overlay. Presentational — the parent owns the `<form>`, react-hook-form
 * wiring, mutation, and the footer buttons. Compose:
 *
 * ```tsx
 * <TimelineEventDialog open={…} onOpenChange={…} mode="create"
 *   footer={<><Button variant="outline" …>Cancel</Button>
 *            <Button type="submit" form="timeline-event-form" …>Save</Button></>}>
 *   <Form {...form}>
 *     <form id="timeline-event-form" onSubmit={…}>
 *       <TimelineEventFormFields … />
 *     </form>
 *   </Form>
 * </TimelineEventDialog>
 * ```
 */
export function TimelineEventDialog({
  open,
  onOpenChange,
  mode,
  title,
  description,
  children,
  footer,
}: TimelineEventDialogProps) {
  const defaults = DEFAULTS[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? defaults.title}</DialogTitle>
          <DialogDescription>
            {description ?? defaults.description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">{children}</div>

        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
