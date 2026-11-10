import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PhoneHeadingProps {
  /** The screen's h1. Absent, the row holds only `trailing`, at the right. */
  title?: ReactNode;
  /** The right slot: the avatar, a cycle chip. */
  trailing?: ReactNode;
  className?: string;
}

export function PhoneHeading({
  title,
  trailing,
  className,
}: PhoneHeadingProps) {
  return (
    <div
      data-slot="phone-heading"
      className={cn(
        "ph-app flex items-center gap-2",
        title === undefined && "justify-end",
        className,
      )}
    >
      {title !== undefined ? (
        <h1 className="ph-h1 min-w-0 flex-1">{title}</h1>
      ) : null}
      {trailing}
    </div>
  );
}
