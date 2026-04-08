"use client";
const stats = [
  { value: "2,400+", label: "Applications tracked" },
  { value: "340+", label: "Active job seekers" },
  { value: "28%", label: "Avg offer rate" },
  { value: "4.9★", label: "User satisfaction" },
];

export function StatsSection() {
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto max-w-5xl px-5 py-20 md:px-8 md:py-28">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
