import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `shadow-card` and `shadow-elevated` are custom `@utility` rules declared in
 * `globals.css`, so stock tailwind-merge does not know they belong to the
 * `shadow` group. Without this, `cn("shadow-elevated", "shadow-none")` keeps
 * BOTH and the later rule in the stylesheet wins — the override silently does
 * nothing. Register them so a caller can actually replace them.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { shadow: ["shadow-card", "shadow-elevated"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAgendaUrgencyColor(diffHours: number) {
  if (diffHours < 0) return "#9CA3AF"; // past
  if (diffHours <= 3) return "#EF4444"; // red
  if (diffHours <= 6) return "#F97316"; // orange
  if (diffHours <= 12) return "#EAB308"; // yellow
  if (diffHours <= 24) return "#3B82F6"; // blue
  return "#9CA3AF"; // >24h gray
}
