import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The board's bottom `.bar`: pinned to the viewport, z-40, above the safe area. */
export function PhoneActionBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="phone-action-bar"
      className={cn("ph-app ph-bar", className)}
      {...props}
    />
  );
}
