import Skeleton from "@/components/ui/Skeleton";

export default function ApplicationCardSkeleton() {
  return (
    <div className="transition-all duration-300 w-full rounded-2xl p-8 my-1 bg-white/5 border border-white/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
      <div className="flex justify-between items-center gap-4 min-h-[45px]">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <Skeleton width="8rem" height="1rem" />
          <Skeleton width="6rem" height="0.75rem" />
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-center min-w-0 text-center">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="0.75rem" />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 min-w-[80px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} circle width="1rem" height="1rem" />
          ))}
        </div>
      </div>
      <Skeleton className="mt-4" height="5rem" />
    </div>
  );
}
