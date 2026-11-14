"use client";

import { useTranslations } from "next-intl";

import { StarRating } from "@/components/ui/star-rating";

// People's names stay as written; each role and quote is
// `landing.testimonials.<key>.role|quote`.
const testimonials = [
  { key: "matheus", stars: 5, name: "Matheus Oliveira" },
  { key: "pietro", stars: 5, name: "Pietro" },
  { key: "joao", stars: 5, name: "Joao Soares" },
] as const;

export function TestimonialsSection() {
  const t = useTranslations("landing");
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
        <div className="mb-14 text-center">
          <p className="mb-2 font-display text-base font-semibold tracking-wide-label text-primary uppercase md:text-lg">
            {t("testimonialsEyebrow")}
          </p>
          <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
            {t("testimonialsTitle")}
          </h3>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((person) => (
            <figure
              key={person.key}
              className="flex flex-col rounded-xl border border-border/60 bg-surface p-6 shadow-card transition-colors duration-200 hover:border-border-strong/60 hover:bg-surface-elevated"
            >
              <div className="mb-4">
                <StarRating rating={person.stars} />
              </div>

              <blockquote className="flex-1 text-sm leading-relaxed text-foreground/85">
                &ldquo;{t(`testimonials.${person.key}.quote`)}&rdquo;
              </blockquote>

              <figcaption className="mt-5 border-t border-border/50 pt-4">
                <p className="font-display text-sm font-semibold text-foreground">
                  {person.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`testimonials.${person.key}.role`)}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
