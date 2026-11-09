"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { PHONE_QUERY } from "@/hooks/use-is-phone";
import { cn } from "@/lib/utils";

export interface PhoneSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** `role="alertdialog"`: a tap on the scrim does not close it. */
  alert?: boolean;
  /** The board's 44px "Close" X beside the title. */
  showClose?: boolean;
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
  titleClassName,
  className,
  children,
}: PhoneSheetProps) {
  const t = useTranslations("common");
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

  const heading = (
    <DialogPrimitive.Title
      className={cn("m-0 text-[22px] font-bold", titleClassName)}
    >
      {title}
    </DialogPrimitive.Title>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="phone-sheet-scrim"
          className="ph-scrim data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        />
        <DialogPrimitive.Content
          data-slot="phone-sheet"
          role={alert ? "alertdialog" : "dialog"}
          {...(description === undefined
            ? { "aria-describedby": undefined }
            : {})}
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
            if (target?.isConnected) target.focus();
          }}
          onPointerDownOutside={
            alert ? (event) => event.preventDefault() : undefined
          }
          className={cn(
            "ph-app ph-sheet duration-300 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom motion-reduce:animate-none",
            className,
          )}
        >
          <span className="ph-grab" aria-hidden="true" />
          {showClose ? (
            <div className="flex items-center justify-between">
              {heading}
              <DialogPrimitive.Close
                aria-label={t("close")}
                className="-mr-2.5 flex size-11 cursor-pointer items-center justify-center text-muted-foreground"
              >
                <X size={20} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
          ) : (
            heading
          )}
          {description !== undefined ? (
            <DialogPrimitive.Description className="ph-hint">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
