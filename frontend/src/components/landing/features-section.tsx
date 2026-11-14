"use client";

import { useTranslations } from "next-intl";
import {
  BarChart3,
  Briefcase,
  LineChart,
  ListChecks,
  Shield,
} from "lucide-react";

// Each feature's words are `landing.features.<key>.title|description`.
const features = [
  { key: "track", icon: Briefcase },
  { key: "pipeline", icon: ListChecks },
  { key: "conversion", icon: BarChart3 },
  { key: "trends", icon: LineChart },
  { key: "borderless", icon: Shield },
  { key: "finalization", icon: ListChecks },
] as const;

export function FeaturesSection() {
  const t = useTranslations("landing");
  return (
    <section className="relative mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
      <div className="mb-14 text-center">
        <p className="mb-2 font-display text-base font-semibold tracking-wide-label text-primary uppercase md:text-lg">
          {t("featuresEyebrow")}
        </p>
        <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
          {t("featuresTitle")}
        </h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.key}
            className={`group animate-fade-in-up stagger-${i + 1} rounded-xl border border-border/60 bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-border-strong/60 hover:bg-surface-elevated hover:shadow-elevated`}
          >
            <div className="mb-4 flex items-center gap-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted transition-colors group-hover:bg-primary/20">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h4 className="font-display text-sm font-semibold tracking-tight-display text-foreground md:text-base">
                {t(`features.${f.key}.title`)}
              </h4>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(`features.${f.key}.description`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
