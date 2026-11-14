"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { PHONE_QUERY } from "@/hooks/use-is-phone";
import { cn } from "@/lib/utils";

/** The sheet's own words: a frame's children name it with these. */
export const PhoneSheetTitle = DialogPrimitive.Title;
export const PhoneSheetDescription = DialogPrimitive.Description;
export const PhoneSheetClose = DialogPrimitive.Close;

export interface PhoneSheetFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `role="alertdialog"`: a tap on the scrim does not close it. */
  alert?: boolean;
  /** A `PhoneSheetDescription` is among the children (Radix pairs it). */
  described?: boolean;
  /** A board's own scrim on top of `.ph-scrim` (QuickAdd's `ph-qa-scrim`). */
  scrimClassName?: string;
  /** Takes focus on close when the element that opened the sheet is gone (a row of a sheet before it). */
  fallbackFocus?: RefObject<HTMLElement | null>;
  className?: string;
  /** A `PhoneSheetTitle` first, then the board's body. */
  children?: ReactNode;
}

/**
 * The bottom sheet with no layout of its own: scrim, `.ph-sheet`, the close
 * at md and the focus hand-back. `PhoneSheet` is the boards' common layout on
 * it; a board that draws its own head and footer (QuickAdd) uses the frame.
 */
export function PhoneSheetFrame({
  open,
  onOpenChange,
  alert = false,
  described = false,
  scrimClassName,
  fallbackFocus,
  className,
  children,
}: PhoneSheetFrameProps) {
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // The phone layout ends at md: a sheet left open across it would trap focus
  // behind the desktop. The same query as `useIsPhone`, so the two never disagree.
  useEffect(() => {
    if (!open) return;
    const phone = window.matchMedia(PHONE_QUERY);
    const close = () => {
      if (!phone.matches) onOpenChange(false);
    };
    close();
    phone.addEventListener("change", close);
    return () => phone.removeEventListener("change", close);
  }, [open, onOpenChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="phone-sheet-scrim"
          className={cn(
            "ph-scrim data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none",
            scrimClassName,
          )}
        />
        <DialogPrimitive.Content
          data-slot="phone-sheet"
          role={alert ? "alertdialog" : "dialog"}
          {...(described ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={() => {
            returnFocusTo.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // No Dialog.Trigger: Radix would hand focus to <body>.
            event.preventDefault();
            const target = returnFocusTo.current;
            returnFocusTo.current = null;
            // <body> is no opener: a sheet opened from a row of a closing
            // sheet finds focus already dropped there.
            if (target && target !== document.body && target.isConnected) {
              target.focus();
            } else {
              fallbackFocus?.current?.focus();
            }
          }}
          onPointerDownOutside={
            alert ? (event) => event.preventDefault() : undefined
          }
          className={cn(
            "ph-app ph-sheet duration-300 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom motion-reduce:animate-none",
            className,
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface PhoneSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** `role="alertdialog"`: a tap on the scrim does not close it. */
  alert?: boolean;
  /** The board's 44px "Close" X beside the title. */
  showClose?: boolean;
  /** See `PhoneSheetFrameProps.fallbackFocus`. */
  fallbackFocus?: RefObject<HTMLElement | null>;
  titleClassName?: string;
  className?: string;
  children?: ReactNode;
}

export function PhoneSheet({
  open,
  onOpenChange,
  title,
  description,
  alert = false,
  showClose = false,
  fallbackFocus,
  titleClassName,
  className,
  children,
}: PhoneSheetProps) {
  const t = useTranslations("common");

  const heading = (
    <PhoneSheetTitle
      className={cn("m-0 text-[22px] font-bold", titleClassName)}
    >
      {title}
    </PhoneSheetTitle>
  );

  return (
    <PhoneSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      alert={alert}
      described={description !== undefined}
      fallbackFocus={fallbackFocus}
      className={className}
    >
      <span className="ph-grab" aria-hidden="true" />
      {showClose ? (
        <div className="flex items-center justify-between">
          {heading}
          <PhoneSheetClose
            aria-label={t("close")}
            className="-mr-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
          >
            <X size={20} aria-hidden="true" />
          </PhoneSheetClose>
        </div>
      ) : (
        heading
      )}
      {description !== undefined ? (
        <PhoneSheetDescription className="ph-hint">
          {description}
        </PhoneSheetDescription>
      ) : null}
      {children}
    </PhoneSheetFrame>
  );
}
