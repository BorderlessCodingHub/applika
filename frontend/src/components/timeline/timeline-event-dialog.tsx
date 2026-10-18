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
      "Record an interview, offer, or rejection for this application.",
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
 * wiring, mutation, and the footer buttons.
 *
 * `max-w-3xl` from `sm`, `1rem` of margin each side below it. Anchored to the
 * top, not centred, and only the body scrolls: picking an event type grows or
 * shrinks the form, and neither the chip under the pointer nor the footer's
 * submit button may move off screen when it does. Compose:
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
      <DialogContent className="top-4 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 p-0 sm:top-[8dvh] sm:max-h-[84dvh] sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{title ?? defaults.title}</DialogTitle>
          <DialogDescription>
            {description ?? defaults.description}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-1 pb-5">
          {children}
        </div>

        <DialogFooter className="flex-row justify-end border-t px-6 py-4">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
