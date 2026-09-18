import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `shadow-card` and `shadow-elevated` are custom `@utility` rules declared in
 * `globals.css`, so stock tailwind-merge does not know they belong to the
 * `shadow` group. Without this, `cn("shadow-elevated", "shadow-none")` keeps
 * BOTH and the later rule in the stylesheet wins — the override silently does
 * nothing. Register them so a caller can actually replace them.
 *
 * `h-viewport`, `min-h-viewport`, `max-h-scrollport` and
 * `max-h-editor-scrollport` are the same story in the `h`, `min-h` and `max-h`
 * groups. The two `max-h-*` ones must both be listed: they are siblings, so
 * without this `cn("max-h-scrollport", "max-h-editor-scrollport")` would keep
 * BOTH and the winner would be whichever `@utility` `globals.css` declares
 * last — not the one the caller wrote last.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: ["shadow-card", "shadow-elevated"],
      h: ["h-viewport"],
      "min-h": ["min-h-viewport"],
      "max-h": ["max-h-scrollport", "max-h-editor-scrollport"],
    },
  },
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
