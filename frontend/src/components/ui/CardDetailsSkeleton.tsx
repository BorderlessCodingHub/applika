// src/components/ui/CardDetailsSkeleton.tsx
"use client";

import Skeleton from "./Skeleton";

export default function CardDetailsSkeleton() {
  return (
    <div className="animate-pulse space-y-3 px-4 py-4 bg-white/5 border border-white/10 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
      {/* Info */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="100%" height="0.875rem" />
        ))}
      </div>

      {/* Observation */}
      <Skeleton width="100%" height="1.5rem" />

      {/* Timeline */}
      <div className="mt-3">
        <Skeleton width="35%" height="1rem" className="mb-2" />
        <div className="relative py-3">
          <div className="absolute left-1 top-0 bottom-0 w-0.5 bg-white/20" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="relative flex items-start mb-3 pl-6 last:mb-0"
            >
              <Skeleton
                circle
                width="0.875rem"
                height="0.875rem"
                className="absolute left-0 top-1.5"
              />
              <div className="flex-1 space-y-1">
                <Skeleton width="55%" height="0.875rem" />
                <Skeleton width="25%" height="0.625rem" />
                <Skeleton width="70%" height="1.5rem" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
