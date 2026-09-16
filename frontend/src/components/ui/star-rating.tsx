import { StarIcon } from "lucide-react";

const TOTAL_STARS = 5;

/**
 * applika-only component (KODI-002 / T032): a read-only 5-star display.
 * Restyled by hand to the new-york idiom; the rounding and the accessible
 * label are unchanged.
 */
export function StarRating({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(TOTAL_STARS, Math.round(rating)));

  return (
    <div
      data-slot="star-rating"
      className="flex gap-1"
      aria-label={`${filled} out of ${TOTAL_STARS} stars`}
    >
      {Array.from({ length: TOTAL_STARS }).map((_, idx) => (
        <StarIcon
          key={idx}
          className={
            idx < filled
              ? "size-4 fill-current text-warning drop-shadow-[0_0_6px_rgba(251,191,36,0.35)]"
              : "size-4 text-muted-foreground/40"
          }
        />
      ))}
    </div>
  );
}
