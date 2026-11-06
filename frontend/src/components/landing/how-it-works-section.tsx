"use client";

import { useTranslations } from "next-intl";
// Each step's words are `landing.steps.<key>.title|description`.
const steps = [
  { step: "01", key: "signIn" },
  { step: "02", key: "add" },
  { step: "03", key: "analyze" },
] as const;

export function HowItWorksSection() {
  const t = useTranslations("landing");
  return (
    <section className="relative border-t border-border/60 bg-card/50">
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
        <div className="mb-16 text-center">
          <p className="mb-2 font-display text-base font-semibold tracking-wide-label text-primary uppercase md:text-lg">
            {t("howEyebrow")}
          </p>
          <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
            {t("howTitle")}
          </h3>
        </div>
        <div className="relative grid gap-8 md:grid-cols-3 md:gap-12">
          <div className="absolute top-10 right-[16.6%] left-[16.6%] hidden h-px bg-border md:block" />
          {steps.map((item) => (
            <div key={item.step} className="relative text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-border/60 bg-surface-elevated shadow-card">
                <span className="font-numeric text-2xl font-bold text-primary">
                  {item.step}
                </span>
              </div>
              <h4 className="mb-2 font-display text-sm font-semibold text-foreground md:text-base">
                {t(`steps.${item.key}.title`)}
              </h4>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
                {t(`steps.${item.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
