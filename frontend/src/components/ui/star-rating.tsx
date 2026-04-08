import { Star } from "lucide-react";

const TOTAL_STARS = 5;

export function StarRating({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(TOTAL_STARS, Math.round(rating)));

  return (
    <div className="flex gap-1" aria-label={`${filled} out of ${TOTAL_STARS} stars`}>
      {Array.from({ length: TOTAL_STARS }).map((_, idx) => (
        <Star
          key={idx}
          className={
            idx < filled
              ? "h-4 w-4 fill-current text-warning drop-shadow-[0_0_6px_rgba(251,191,36,0.35)]"
              : "h-4 w-4 text-muted-foreground/40"
          }
        />
      ))}
    </div>
  );
}
