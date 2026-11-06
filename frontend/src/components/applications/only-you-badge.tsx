import { LockKeyholeIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a private company or platform (`is_public: false`) in the pickers. The
 * admin screens pass `label="Private"`.
 */
export function OnlyYouBadge({
  label,
  className,
}: {
  /** Defaults to "Only you" in the active language. */
  label?: string;
  className?: string;
}) {
  const t = useTranslations("applications.catalog");
  return (
    <Badge
      variant="outline"
      data-slot="only-you-badge"
      className={cn("shrink-0 gap-1 px-1.5", className)}
    >
      {/* Explicit size: CommandItem's `[&_svg:not([class*='size-'])]:size-4` outranks the Badge's own. */}
      <LockKeyholeIcon aria-hidden className="size-3" />
      {label ?? t("onlyYou")}
    </Badge>
  );
}
