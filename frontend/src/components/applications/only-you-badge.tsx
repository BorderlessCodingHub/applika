import { LockKeyholeIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ONLY_YOU_LABEL = "Only you";

/**
 * Marks a private company or platform (`is_public: false`) in the pickers. The
 * admin screens pass `label="Private"`.
 */
export function OnlyYouBadge({
  label = ONLY_YOU_LABEL,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      data-slot="only-you-badge"
      className={cn("shrink-0 gap-1 px-1.5", className)}
    >
      {/* Explicit size: CommandItem's `[&_svg:not([class*='size-'])]:size-4` outranks the Badge's own. */}
      <LockKeyholeIcon aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}
