"use client";
const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

const testimonials = [
  {
    name: "Sarah K.",
    role: "Frontend Developer",
    quote:
      "Applika turned my chaotic spreadsheet into a clean pipeline. I landed my dream job in 6 weeks.",
  },
  {
    name: "Marcus L.",
    role: "Product Manager",
    quote:
      "The analytics showed me I was applying too broadly. After refocusing, my interview rate doubled.",
  },
  {
    name: "Priya R.",
    role: "Data Engineer",
    quote:
      "Step tracking is a game-changer. I always know exactly where I stand with every company.",
  },
];

export function TestimonialsSection() {
  return (
    <section className="relative border-t border-border/60 bg-card/50">
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
        <div className="mb-14 text-center">
          <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide-label text-primary md:text-lg">
            Testimonials
          </p>
          <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
            Loved by job seekers
          </h3>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-xl border border-border/60 bg-background p-6 shadow-card"
            >
              <div className="mb-3 flex">
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className="h-3.5 w-3.5 fill-current text-warning"
                    viewBox="0 0 20 20"
                  >
                    <path d={STAR_PATH} />
                  </svg>
                ))}
              </div>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="font-display text-sm font-semibold text-foreground">
                  {t.name}
                </p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
