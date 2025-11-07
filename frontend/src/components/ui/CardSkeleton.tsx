export default function CardSkeleton() {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-8 animate-pulse shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
      <div className="h-6 w-1/3 bg-white/10 rounded mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white/10 h-20 rounded-xl border border-white/10"
          />
        ))}
      </div>
    </div>
  );
}
