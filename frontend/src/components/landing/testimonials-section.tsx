"use client";

import { StarRating } from "@/components/ui/star-rating";

type TestimonialType = {
  stars: number;
  name: string;
  role: string;
  quote: string;
};

const testimonials = [
  {
    stars: 5,
    name: "Matheus Oliveira",
    role: "Software Engineer - LLMOps",
    quote:
      "Applika has a very simple UI that captures extremely important metrics in the application process!",
  },
  {
    stars: 5,
    name: "Pietro",
    role: "Software Engineer",
    quote:
      "Having every application tracked with stages and analytics changed how I approach job hunting." +
      " I always know exactly where each process stands and what to focus on next.",
  },
  {
    stars: 5,
    name: "Joao Soares",
    role: "Senior Engineer",
    quote:
      "Applika showed me exactly what I was getting wrong in my applications, and honestly, that changed everything for me.",
  },
] as TestimonialType[];

export function TestimonialsSection() {
  return (
    <section className="relative border-t border-border/60">
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
            <figure
              key={t.name}
              className="flex flex-col rounded-xl border border-border/60 bg-card p-6 shadow-card transition-colors duration-200 hover:border-border"
            >
              <div className="mb-4">
                <StarRating rating={t.stars} />
              </div>

              <blockquote className="flex-1 text-sm leading-relaxed text-foreground/85">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <figcaption className="mt-5 border-t border-border/50 pt-4">
                <p className="font-display text-sm font-semibold text-foreground">
                  {t.name}
                </p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
