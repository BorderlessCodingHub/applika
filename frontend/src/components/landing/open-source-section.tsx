"use client";

import { useTranslations } from "next-intl";

import { Code2, GitFork } from "lucide-react";

// Each value's words are `landing.openSource.<key>.title|description`.
const values = [
  { key: "open", icon: Code2 },
  { key: "community", icon: GitFork },
] as const;

export function OpenSourceSection() {
  const t = useTranslations("landing");
  return (
    <section className="relative border-t border-border/60 bg-card/50">
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
        <div className="mb-14 text-center">
          <p className="mb-2 font-display text-base font-semibold tracking-wide-label text-primary uppercase md:text-lg">
            {t("openSourceEyebrow")}
          </p>
          <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
            {t("openSourceTitle")}
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            {t("openSourceBody")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {values.map((v, i) => (
            <div
              key={v.key}
              className={`group animate-fade-in-up stagger-${i + 1} rounded-xl border border-border/60 bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-border-strong/60 hover:bg-surface-elevated hover:shadow-elevated`}
            >
              <div className="mb-4 flex items-center gap-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted transition-colors group-hover:bg-primary/20">
                  <v.icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-display text-sm font-semibold tracking-tight-display text-foreground md:text-base">
                  {t(`openSource.${v.key}.title`)}
                </h4>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`openSource.${v.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
