import type { ComponentProps } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneFabProps extends Omit<
  ComponentProps<"button">,
  "children" | "type"
> {
  label: string;
}

export function PhoneFab({ label, className, ...props }: PhoneFabProps) {
  return (
    // `contents`: `.ph-app :focus-visible` needs an ancestor, and this one makes no box.
    <div className="ph-app contents">
      <button
        type="button"
        data-slot="phone-fab"
        className={cn("ph-fab", className)}
        {...props}
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
