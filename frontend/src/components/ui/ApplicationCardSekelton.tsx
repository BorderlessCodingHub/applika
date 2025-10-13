// src/features/applications/components/ApplicationCardSkeleton.tsx
"use client";

export default function ApplicationCardSkeleton() {
  return (
    <div className="animate-pulse transition-all duration-300 w-full rounded-2xl p-8 my-1 bg-white/5 border border-white/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
      <div className="flex justify-between items-center gap-4 min-h-[45px]">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <div className="h-4 w-32 bg-white/20 rounded" />
          <div className="h-3 w-24 bg-white/10 rounded" />
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-center min-w-0 text-center">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 w-full bg-white/10 rounded" />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 min-w-[80px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-4 bg-white/10 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mt-4 h-20 bg-white/10 rounded-xl" />
    </div>
  );
}
